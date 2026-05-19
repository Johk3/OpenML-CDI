import { CROISSANT_GENERATED_FIELDS } from '../constants/croissantFields';

export type FieldValue = string | number | boolean | string[] | null;
export type FormSection = Record<string, FieldValue>;

export type RecordSetData = Record<string, FieldValue | FormSection[]> & {
  field?: FormSection[];
};

export type CroissantFormData = {
  dataset: FormSection;
  distribution: FormSection[];
  fileSet: FormSection[];
  recordSet: RecordSetData[];
  rai: FormSection;
};

const INTERNAL_FORM_KEYS = new Set(['_generated']);
const FIELD_REFERENCE_KEYS = new Set(['references', 'parentField', 'subField']);
const SOURCE_REFERENCE_KEYS = new Set(['fileObject', 'fileSet', 'recordSet']);

function toJsonLdReference(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => toJsonLdReference(item));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? { '@id': trimmed } : value;
  }
  return value;
}

function normalizeSourceReferences(source: unknown): unknown {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;

  const normalized = { ...(source as Record<string, unknown>) };
  SOURCE_REFERENCE_KEYS.forEach((key) => {
    if (key in normalized) {
      normalized[key] = toJsonLdReference(normalized[key]);
    }
  });
  return normalized;
}

function normalizeField(item: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...item };
  FIELD_REFERENCE_KEYS.forEach((key) => {
    if (key in normalized) {
      normalized[key] = toJsonLdReference(normalized[key]);
    }
  });
  if ('source' in normalized) {
    normalized.source = normalizeSourceReferences(normalized.source);
  }
  return { '@type': 'cr:Field', ...normalized };
}

function normalizeFileSet(item: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...item };
  if ('containedIn' in normalized) {
    normalized.containedIn = toJsonLdReference(normalized.containedIn);
  }
  return { '@type': 'cr:FileSet', ...normalized };
}

function normalizeFileObject(item: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...item };
  if ('containedIn' in normalized) {
    normalized.containedIn = toJsonLdReference(normalized.containedIn);
  }
  return { '@type': 'cr:FileObject', ...normalized };
}

function normalizeRecordSet(item: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...item };
  if (Array.isArray(normalized.field)) {
    normalized.field = (normalized.field as Record<string, unknown>[]).map((field) =>
      normalizeField(field),
    );
  }
  return { '@type': 'cr:RecordSet', ...normalized };
}

// Helper to transform form data to croissant JSON-LD
function unflatten(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (INTERNAL_FORM_KEYS.has(key)) continue;
    if (val === undefined || val === '') continue;
    const parts = key.split('.');
    let curr = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof curr[parts[i]] !== 'object' || curr[parts[i]] === null) {
        curr[parts[i]] = {};
      }
      curr = curr[parts[i]] as Record<string, unknown>;
    }
    curr[parts[parts.length - 1]] = val;
  }
  return result;
}

// Helper to transform form data to croissant JSON-LD
function stripPrefixes(objList: FormSection[], prefix: string): Record<string, unknown>[] {
  return objList.map((obj) => {
    const cleanObj: Record<string, unknown> = {};
    Object.entries(obj).forEach(([key, val]) => {
      if (INTERNAL_FORM_KEYS.has(key)) return;
      if (val === undefined || val === '') return;
      if (key === 'field' && Array.isArray(val)) {
        cleanObj['field'] = stripPrefixes(val as unknown as FormSection[], 'field');
        return;
      }
      if (key.startsWith(prefix + '.')) {
        const parts = key.replace(prefix + '.', '').split('.');
        let current = cleanObj;
        for (let i = 0; i < parts.length - 1; i++) {
          if (typeof current[parts[i]] !== 'object' || current[parts[i]] === null) {
            current[parts[i]] = {};
          }
          current = current[parts[i]] as Record<string, unknown>;
        }
        current[parts[parts.length - 1]] = val;
      } else {
        cleanObj[key] = val;
      }
    });
    return cleanObj;
  });
}

// Helper to transform form data to croissant JSON-LD
function stripPrefixesObj(obj: FormSection, prefix: string): Record<string, unknown> {
  const list = stripPrefixes([obj], prefix);
  return list.length > 0 ? list[0] : {};
}

/** Serializes the Croissant form state into a JSON-LD object. */
export function serializeCroissant(formData: CroissantFormData): Record<string, unknown> {
  const generatedDataset: Record<string, unknown> = { ...formData.dataset };
  const raiPresent = Object.keys(formData.rai).length > 0;

  CROISSANT_GENERATED_FIELDS.forEach((genField) => {
    generatedDataset[genField.id] = genField.value;
  });
  generatedDataset['conformsTo'] = 'http://mlcommons.org/croissant/1.1';

  const creator = generatedDataset['creator'];
  if (Array.isArray(creator)) {
    generatedDataset['creator'] = creator.map((c: unknown) =>
      typeof c === 'string' ? { '@type': 'sc:Person', name: c } : c,
    );
  }

  const distributionItems = stripPrefixes(formData.distribution, 'distribution').map((item) =>
    normalizeFileObject(item),
  );

  const fileSetItems = stripPrefixes(formData.fileSet, 'fileSet').map((item) => ({
    ...normalizeFileSet(item),
  }));
  const distributionResources = [...distributionItems, ...fileSetItems];

  return {
    ...unflatten(generatedDataset),
    ...(distributionResources.length > 0 && { distribution: distributionResources }),
    ...(formData.recordSet.length > 0 && {
      recordSet: stripPrefixes(formData.recordSet as unknown as FormSection[], 'recordSet').map(
        (item) => normalizeRecordSet(item),
      ),
    }),
    ...(raiPresent && { rai: stripPrefixesObj(formData.rai, 'rai') }),
  };
}
