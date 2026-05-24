import { describe, expect, it } from 'vitest';
import { validateCroissantField } from '@/utils/croissantFieldValidation';
import type { CroissantFieldDef } from '@/types/croissant';

const textField = (overrides: Partial<CroissantFieldDef> = {}): CroissantFieldDef => ({
  id: 'name',
  label: 'Dataset Name',
  section: 'dataset',
  inputType: 'text',
  required: true,
  helperText: '',
  ...overrides,
});

describe('validateCroissantField', () => {
  it('returns a labeled required message for missing required values', () => {
    expect(validateCroissantField(textField(), {})).toEqual({
      ok: false,
      message: 'Dataset Name is required.',
    });
  });

  it('treats missing optional values as valid', () => {
    expect(validateCroissantField(textField({ required: false }), {})).toEqual({ ok: true });
  });

  it('returns a labeled pattern message when a value does not match', () => {
    expect(
      validateCroissantField(
        textField({
          pattern: '^[a-z0-9_-]+$',
          patternMessage: 'Must only contain lowercase letters, numbers, hyphens, and underscores.',
        }),
        { name: 'Bad Name' },
      ),
    ).toEqual({
      ok: false,
      message:
        'Dataset Name: Must only contain lowercase letters, numbers, hyphens, and underscores.',
    });
  });

  it('parses JSON fields before returning JSON errors', () => {
    const field = textField({
      id: 'annotation',
      label: 'Annotation',
      inputType: 'textarea',
      required: false,
      isJson: true,
    });

    expect(validateCroissantField(field, { annotation: '{"ok": true}' })).toEqual({ ok: true });
    expect(validateCroissantField(field, { annotation: '{bad json' })).toEqual({
      ok: false,
      message: 'Annotation must contain valid JSON.',
    });
  });
});
