import { CROISSANT_USER_FIELDS } from '@/constants/croissantFields';
import type { CroissantFieldDef, FieldSection } from '@/types/croissant';
import type { CroissantFormData, FormSection, RecordSetData } from './serializeCroissant';
import { validateCroissantField } from './croissantFieldValidation';

export const MISSING_DISTRIBUTION_MESSAGE =
  'Add at least one FileObject or FileSet before saving Croissant metadata.';
export const MISSING_DISTRIBUTION_HASH_MESSAGE =
  'At least one of MD5 Hash or SHA-256 Hash is required for each distribution item.';
export const DISTRIBUTION_HASH_GUIDANCE =
  'Provide at least one checksum, either SHA-256 or MD5. SHA-256 is preferred.';
export const DISTRIBUTION_HASH_ERROR_FIELD_ID = 'distribution.hash';

export type CroissantFormSectionId = Exclude<FieldSection, 'field'>;

export type CroissantInvalidFormTarget = {
  section: CroissantFormSectionId;
  itemIndex?: number;
  fieldIndex?: number;
  fieldId?: string;
  message: string;
};

export type CroissantFieldErrorLocation = {
  section: CroissantFormSectionId;
  itemIndex?: number;
  fieldIndex?: number;
  fieldId: string;
};

export type CroissantFormValidationResult = {
  firstError: CroissantInvalidFormTarget | null;
  fieldErrors: Record<string, string>;
};

type ValidateCroissantFormOptions = {
  fields?: CroissantFieldDef[];
  canEditField?: (field: CroissantFieldDef) => boolean;
  validateDistributionHashes?: boolean;
};

type SectionValidationItem = {
  item: Record<string, unknown>;
  itemIndex?: number;
  fieldIndex?: number;
};

type SectionValidationConfig = {
  section: CroissantFormSectionId;
  fieldSection: FieldSection;
  items: (formData: CroissantFormData) => SectionValidationItem[];
  rules?: Array<(item: SectionValidationItem) => { fieldId: string; message: string } | undefined>;
};

const DEFAULT_CAN_EDIT_FIELD = () => true;

function recordSetFieldsFor(recordSet: RecordSetData | undefined): FormSection[] {
  return Array.isArray(recordSet?.field) ? (recordSet.field as FormSection[]) : [];
}

function distributionHasHash(item: Record<string, unknown>): boolean {
  if (item._generated) return true;
  return Boolean(
    (item['distribution.md5'] as string | undefined)?.trim() ||
    (item['distribution.sha256'] as string | undefined)?.trim(),
  );
}

function distributionHashError(item: Record<string, unknown>): string | undefined {
  return distributionHasHash(item) ? undefined : MISSING_DISTRIBUTION_HASH_MESSAGE;
}

function fieldErrorKey(location: CroissantFieldErrorLocation): string {
  return [
    location.section,
    location.itemIndex ?? '',
    location.fieldIndex ?? '',
    location.fieldId,
  ].join(':');
}

export function getCroissantFieldError(
  fieldErrors: Record<string, string>,
  location: CroissantFieldErrorLocation,
): string | undefined {
  return fieldErrors[fieldErrorKey(location)];
}

function groupFieldsBySection(
  fields: CroissantFieldDef[],
): Record<FieldSection, CroissantFieldDef[]> {
  return {
    dataset: fields.filter((field) => field.section === 'dataset'),
    distribution: fields.filter((field) => field.section === 'distribution'),
    fileSet: fields.filter((field) => field.section === 'fileSet'),
    recordSet: fields.filter((field) => field.section === 'recordSet'),
    field: fields.filter((field) => field.section === 'field'),
    rai: fields.filter((field) => field.section === 'rai'),
  };
}

function getSectionConfigs(validateDistributionHashes: boolean): SectionValidationConfig[] {
  return [
    {
      section: 'dataset',
      fieldSection: 'dataset',
      items: (formData) => [{ item: formData.dataset }],
    },
    {
      section: 'distribution',
      fieldSection: 'distribution',
      items: (formData) =>
        formData.distribution.map((item, itemIndex) => ({
          item,
          itemIndex,
        })),
      rules: validateDistributionHashes
        ? [
            ({ item }) => {
              const message = distributionHashError(item);
              return message ? { fieldId: DISTRIBUTION_HASH_ERROR_FIELD_ID, message } : undefined;
            },
          ]
        : undefined,
    },
    {
      section: 'fileSet',
      fieldSection: 'fileSet',
      items: (formData) =>
        formData.fileSet.map((item, itemIndex) => ({
          item,
          itemIndex,
        })),
    },
    {
      section: 'recordSet',
      fieldSection: 'recordSet',
      items: (formData) =>
        formData.recordSet.map((item, itemIndex) => ({
          item,
          itemIndex,
        })),
    },
    {
      section: 'recordSet',
      fieldSection: 'field',
      items: (formData) =>
        formData.recordSet.flatMap((recordSet, itemIndex) =>
          recordSetFieldsFor(recordSet).map((item, fieldIndex) => ({
            item,
            itemIndex,
            fieldIndex,
          })),
        ),
    },
    {
      section: 'rai',
      fieldSection: 'rai',
      items: (formData) => [{ item: formData.rai }],
    },
  ];
}

export function validateCroissantForm(
  formData: CroissantFormData,
  options: ValidateCroissantFormOptions = {},
): CroissantFormValidationResult {
  const fieldsBySection = groupFieldsBySection(options.fields ?? CROISSANT_USER_FIELDS);
  const canEditField = options.canEditField ?? DEFAULT_CAN_EDIT_FIELD;
  const fieldErrors: Record<string, string> = {};
  let firstError: CroissantInvalidFormTarget | null = null;

  const setFirstError = (target: CroissantInvalidFormTarget) => {
    firstError ??= target;
  };

  for (const config of getSectionConfigs(Boolean(options.validateDistributionHashes))) {
    if (config.section === 'distribution' && formData.distribution.length === 0) {
      if (formData.fileSet.length === 0) {
        setFirstError({
          section: 'distribution',
          message: MISSING_DISTRIBUTION_MESSAGE,
        });
      }
    }

    for (const validationItem of config.items(formData)) {
      for (const field of fieldsBySection[config.fieldSection]) {
        if (!canEditField(field)) continue;

        const validation = validateCroissantField(field, validationItem.item);
        if (!validation.ok) {
          const target = {
            section: config.section,
            itemIndex: validationItem.itemIndex,
            fieldIndex: validationItem.fieldIndex,
            fieldId: field.id,
            message: validation.message,
          };
          fieldErrors[fieldErrorKey(target)] = validation.message;
          setFirstError(target);
        }
      }

      for (const rule of config.rules ?? []) {
        const validation = rule(validationItem);
        if (!validation) continue;

        const target = {
          section: config.section,
          itemIndex: validationItem.itemIndex,
          fieldIndex: validationItem.fieldIndex,
          fieldId: validation.fieldId,
          message: validation.message,
        };
        fieldErrors[fieldErrorKey(target)] = validation.message;
        setFirstError(target);
      }
    }
  }

  return { firstError, fieldErrors };
}
