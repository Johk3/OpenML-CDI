import { describe, expect, it } from 'vitest';
import { getApiErrorMessage } from '@/lib/apiErrors';

describe('getApiErrorMessage', () => {
  it('formats structured backend validation errors with field details', () => {
    const error = {
      response: {
        data: {
          error: {
            message: 'Invalid request body',
            fields: {
              name: ['Field required'],
            },
          },
        },
      },
    };

    expect(getApiErrorMessage(error, 'Fallback message')).toBe(
      'Invalid request body: name: Field required',
    );
  });

  it('falls back to backend detail strings', () => {
    const error = {
      response: {
        data: {
          detail: 'Dataset files are not available for download',
        },
      },
    };

    expect(getApiErrorMessage(error, 'Fallback message')).toBe(
      'Dataset files are not available for download',
    );
  });
});
