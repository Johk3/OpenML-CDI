import type { CroissantFieldDef } from '@/types/croissant';
import type { FieldValue } from './serializeCroissant';

export type CroissantFieldValidationResult = { ok: true } | { ok: false; message: string };

const VALID_FIELD_RESULT: CroissantFieldValidationResult = { ok: true };

function invalid(message: string): CroissantFieldValidationResult {
  return { ok: false, message };
}

function hasFieldValue(value: FieldValue | undefined): boolean {
  return !(
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function fieldValueAsString(value: FieldValue | undefined): string {
  return Array.isArray(value) ? value.join(', ') : String(value ?? '');
}

function isValidAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
}

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function validateCroissantField(
  field: CroissantFieldDef,
  item: Record<string, unknown>,
): CroissantFieldValidationResult {
  const value = item[field.id] as FieldValue | undefined;
  if (!hasFieldValue(value)) {
    return field.required ? invalid(`${field.label} is required.`) : VALID_FIELD_RESULT;
  }

  const textValue = fieldValueAsString(value);
  if (field.pattern && !new RegExp(field.pattern).test(textValue)) {
    return invalid(
      field.patternMessage
        ? `${field.label}: ${field.patternMessage}`
        : `${field.label} has an invalid format.`,
    );
  }

  if (field.inputType === 'url' && !isValidAbsoluteUrl(textValue)) {
    return invalid(`${field.label} must be a valid URL.`);
  }

  if (field.inputType === 'date' && !isValidDateOnly(textValue)) {
    return invalid(`${field.label} must be a valid date.`);
  }

  if (field.isJson) {
    try {
      JSON.parse(textValue);
    } catch {
      return invalid(`${field.label} must contain valid JSON.`);
    }
  }

  return VALID_FIELD_RESULT;
}
