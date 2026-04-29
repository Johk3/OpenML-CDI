import { CroissantFormData, FormSection, FieldValue, RecordSetData } from './serializeCroissant';

// Flatten nested objects
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip internal JSON-LD keys
    if (key.startsWith('@')) continue;

    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Record<string, unknown>, newKey));
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

// Add prefixes to items in a list
function addPrefixes(objList: unknown[], prefix: string): FormSection[] {
  if (!Array.isArray(objList)) return [];

  return objList.map((item) => {
    if (typeof item !== 'object' || item === null) return {};

    const flattened = flatten(item as Record<string, unknown>);
    const prefixed: FormSection = {};

    Object.entries(flattened).forEach(([key, val]) => {
      prefixed[`${prefix}.${key}`] = val as FieldValue;
    });

    return prefixed;
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

  result.dataset = flattenedDataset as FormSection;

  // Handle distribution
  if (Array.isArray(json.distribution)) {
    result.distribution = addPrefixes(json.distribution, 'distribution');
  }

  //Handle fileSet
  if (Array.isArray(json.fileSet)) {
    result.fileSet = addPrefixes(json.fileSet, 'fileSet');
  }

  // Handle recordSet
  if (Array.isArray(json.recordSet)) {
    result.recordSet = addPrefixes(json.recordSet, 'recordSet') as unknown as RecordSetData[];
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
