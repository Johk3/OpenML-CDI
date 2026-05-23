function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatFieldErrors(fields: unknown): string | null {
  if (!isRecord(fields)) return null;

  const messages = Object.entries(fields)
    .map(([field, value]) => {
      if (Array.isArray(value)) {
        const fieldMessages = value.filter(
          (message): message is string => typeof message === 'string',
        );
        return fieldMessages.length > 0 ? `${field}: ${fieldMessages.join(', ')}` : null;
      }

      const message = stringValue(value);
      return message ? `${field}: ${message}` : null;
    })
    .filter((message): message is string => Boolean(message));

  return messages.length > 0 ? messages.join('; ') : null;
}

function messageFromErrorBody(body: unknown): string | null {
  if (!isRecord(body)) return null;

  const message = stringValue(body.message);
  const fields = formatFieldErrors(body.fields);

  if (message && fields) return `${message}: ${fields}`;
  return message ?? fields;
}

function messageFromPayload(payload: unknown): string | null {
  const payloadMessage = stringValue(payload);
  if (payloadMessage) return payloadMessage;
  if (!isRecord(payload)) return null;

  return (
    messageFromErrorBody(payload.error) ??
    stringValue(payload.detail) ??
    messageFromErrorBody(payload.detail) ??
    stringValue(payload.message) ??
    messageFromErrorBody(payload)
  );
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isRecord(error) && isRecord(error.response)) {
    const responseMessage = messageFromPayload(error.response.data);
    if (responseMessage) return responseMessage;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
