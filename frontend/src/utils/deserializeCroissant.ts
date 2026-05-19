import { CroissantFormData, FormSection, FieldValue, RecordSetData } from './serializeCroissant';

// Flatten nested objects
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip internal JSON-LD keys
    if (key.startsWith('@') && key !== '@id') continue;

    const newKey = prefix ? `${prefix}.${key}` : key;

    if (isJsonLdReference(value)) {
      result[newKey] = (value as Record<string, unknown>)['@id'];
    } else if (Array.isArray(value)) {
      result[newKey] = value.map((item) =>
        isJsonLdReference(item) ? (item as Record<string, unknown>)['@id'] : item,
      );
    } else if (value !== null && typeof value === 'object') {
      Object.assign(result, flatten(value as Record<string, unknown>, newKey));
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

function isJsonLdReference(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)['@id'] === 'string' &&
    Object.keys(value as Record<string, unknown>).every((key) => key === '@id')
  );
}

function prefixFlattened(item: Record<string, unknown>, prefix: string): FormSection {
  const flattened = flatten(item);
  const prefixed: FormSection = {};

  Object.entries(flattened).forEach(([key, val]) => {
    prefixed[`${prefix}.${key}`] = val as FieldValue;
  });

  return prefixed;
}

function legacyOpenMlFields(dataset: FormSection): FormSection {
  const migrated = { ...dataset };
  const legacyFields = ['defaultTargetAttribute', 'ignoreAttribute', 'rowIdAttribute', 'taskType'];

  legacyFields.forEach((field) => {
    const legacyKey = `openml.${field}`;
    const namespacedKey = `openml:${field}`;
    if (legacyKey in migrated && !(namespacedKey in migrated)) {
      migrated[namespacedKey] = migrated[legacyKey];
    }
    delete migrated[legacyKey];
  });

  return migrated;
}

function addRecordSetPrefixes(objList: unknown[]): RecordSetData[] {
  if (!Array.isArray(objList)) return [];

  return objList.map((item) => {
    if (typeof item !== 'object' || item === null) return {};

    const { field, ...recordSetFields } = item as Record<string, unknown>;
    const prefixed = prefixFlattened(recordSetFields, 'recordSet') as RecordSetData;

    if (Array.isArray(field)) {
      prefixed.field = addPrefixes(field, 'field');
    }

    return prefixed;
  });
}

// Add prefixes to items in a list
function addPrefixes(objList: unknown[], prefix: string): FormSection[] {
  if (!Array.isArray(objList)) return [];

  return objList.map((item) => {
    if (typeof item !== 'object' || item === null) return {};

    return prefixFlattened(item as Record<string, unknown>, prefix);
  });
}

// Deserialize a nested Croissant JSON-LD object back into the flat form structure.
export function deserializeCroissant(json: Record<string, unknown>): CroissantFormData {
  const result: CroissantFormData = {
    dataset: {},
    distribution: [],
    fileSet: [],
    recordSet: [],
    rai: {},
  };

  if (!json) return result;

  const coreFields = { ...json };
  delete coreFields.distribution;
  delete coreFields.fileSet;
  delete coreFields.recordSet;
  delete coreFields.rai;

  const flattenedDataset = flatten(coreFields);

  if (Array.isArray(json.creator)) {
    flattenedDataset['creator'] = (json.creator as unknown[]).map((c) => {
      if (typeof c === 'object' && c !== null) {
        const creatorObj = c as Record<string, unknown>;
        return (creatorObj.name || creatorObj.givenName || '') as string;
      }
      return String(c);
    });
  }

  result.dataset = legacyOpenMlFields(flattenedDataset as FormSection);

  // Handle distribution. Croissant represents both FileObject and FileSet resources
  // in distribution; the UI keeps them in separate editable sections.
  if (Array.isArray(json.distribution)) {
    const distributionItems = json.distribution.filter((item) => {
      if (typeof item !== 'object' || item === null) return false;
      return (item as Record<string, unknown>)['@type'] !== 'cr:FileSet';
    });
    const fileSetItems = json.distribution.filter((item) => {
      if (typeof item !== 'object' || item === null) return false;
      return (item as Record<string, unknown>)['@type'] === 'cr:FileSet';
    });

    result.distribution = addPrefixes(distributionItems, 'distribution');
    result.fileSet = addPrefixes(fileSetItems, 'fileSet');
  }

  //Handle fileSet
  if (Array.isArray(json.fileSet)) {
    result.fileSet = [...result.fileSet, ...addPrefixes(json.fileSet, 'fileSet')];
  }

  // Handle recordSet
  if (Array.isArray(json.recordSet)) {
    result.recordSet = addRecordSetPrefixes(json.recordSet);
  }

  // Handle RAI
  if (json.rai && typeof json.rai === 'object') {
    const flattenedRai = flatten(json.rai as Record<string, unknown>);
    const prefixedRai: FormSection = {};
    Object.entries(flattenedRai).forEach(([key, val]) => {
      prefixedRai[`rai.${key}`] = val as FieldValue;
    });
    result.rai = prefixedRai;
  }

  return result;
}
