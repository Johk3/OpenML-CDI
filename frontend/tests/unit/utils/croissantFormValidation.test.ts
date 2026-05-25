import { describe, expect, it } from 'vitest';
import {
  DISTRIBUTION_HASH_ERROR_FIELD_ID,
  getCroissantFieldError,
  MISSING_DISTRIBUTION_HASH_MESSAGE,
  validateCroissantForm,
} from '@/utils/croissantFormValidation';
import type { CroissantFieldDef } from '@/types/croissant';

const field = (
  id: string,
  label: string,
  section: CroissantFieldDef['section'],
): CroissantFieldDef => ({
  id,
  label,
  section,
  inputType: 'text',
  required: true,
  helperText: '',
});

describe('validateCroissantForm', () => {
  it('returns the first invalid target and stores inline field errors from one pass', () => {
    const fields = [
      field('name', 'Dataset Name', 'dataset'),
      field('distribution.name', 'File Name', 'distribution'),
      field('field.name', 'Field Name', 'field'),
    ];

    const validation = validateCroissantForm(
      {
        dataset: { name: 'Ready' },
        distribution: [{ 'distribution.name': '' }],
        fileSet: [],
        recordSet: [{ 'recordSet.name': 'Rows', field: [{ 'field.name': '' }] }],
        rai: {},
      },
      { fields },
    );

    expect(validation.firstError).toEqual({
      section: 'distribution',
      itemIndex: 0,
      fieldId: 'distribution.name',
      message: 'File Name is required.',
    });
    expect(
      getCroissantFieldError(validation.fieldErrors, {
        section: 'recordSet',
        itemIndex: 0,
        fieldIndex: 0,
        fieldId: 'field.name',
      }),
    ).toBe('Field Name is required.');
  });

  it('uses the shared hash rule for first error and inline distribution hash errors', () => {
    const validation = validateCroissantForm(
      {
        dataset: {},
        distribution: [{ 'distribution.name': 'data.csv' }],
        fileSet: [],
        recordSet: [],
        rai: {},
      },
      {
        fields: [field('distribution.name', 'File Name', 'distribution')],
        validateDistributionHashes: true,
      },
    );

    expect(validation.firstError).toEqual({
      section: 'distribution',
      itemIndex: 0,
      fieldId: DISTRIBUTION_HASH_ERROR_FIELD_ID,
      message: MISSING_DISTRIBUTION_HASH_MESSAGE,
    });
    expect(
      getCroissantFieldError(validation.fieldErrors, {
        section: 'distribution',
        itemIndex: 0,
        fieldId: DISTRIBUTION_HASH_ERROR_FIELD_ID,
      }),
    ).toBe(MISSING_DISTRIBUTION_HASH_MESSAGE);
  });
});
