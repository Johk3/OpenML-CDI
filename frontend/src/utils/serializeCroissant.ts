import { CROISSANT_GENERATED_FIELDS } from '../constants/croissantFields';

export type FieldValue = string | number | boolean | string[] | null;
export type FormSection = Record<string, FieldValue>;

export type RecordSetData = Record<string, FieldValue | FormSection[]> & {
  field?: FormSection[];
};

export type CroissantFormData = {
  dataset: FormSection;
  distribution: FormSection[];
  fileSet: FormSection[]; // ignored for now
  recordSet: RecordSetData[]; // ignored for now
  rai: FormSection; // ignored for now
};

// Helper to transform form data to croissant JSON-LD
function unflatten(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
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

  const distributionItems = stripPrefixes(formData.distribution, 'distribution').map((item) => ({
    '@type': 'cr:FileObject',
    ...item,
  }));

  const fileSetItems = stripPrefixes(formData.fileSet, 'fileSet').map((item) => ({
    '@type': 'cr:FileSet',
    ...item,
  }));

  return {
    ...unflatten(generatedDataset),
    ...(formData.distribution.length > 0 && { distribution: distributionItems }),
    ...(formData.fileSet.length > 0 && { fileSet: fileSetItems }), // TODO: Check if this is a bug
    ...(formData.recordSet.length > 0 && {
      recordSet: stripPrefixes(formData.recordSet as unknown as FormSection[], 'recordSet').map(
        (item) => ({
          '@type': 'cr:RecordSet',
          ...item,
        }),
      ),
    }),
    ...(raiPresent && { rai: stripPrefixesObj(formData.rai, 'rai') }),
  };
}
