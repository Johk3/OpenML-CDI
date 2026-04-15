// parses a math expression string into a number.
function parseMathExpression(expression: string | undefined, fallback: number): number {
  if (!expression) return fallback;

  try {
    // Split by '*' and multiply the parts
    const parts = expression.split('*').map((part) => part.trim());
    const result = parts.reduce((acc, part) => {
      const num = parseFloat(part);
      if (isNaN(num)) throw new Error('Invalid number');
      return acc * num;
    }, 1);

    return result;
  } catch (error) {
    console.warn(
      `Failed to parse config expression: "${expression}". Using fallback: ${fallback}`,
      error,
    );
    return fallback;
  }
}

// Default to 500 MB if not specified
const DEFAULT_LIMIT = 500 * 1024 * 1024;

export const CONFIG = {
  FILE_UPLOAD_LIMIT_BYTES: parseMathExpression(
    import.meta.env.VITE_FILE_UPLOAD_LIMIT,
    DEFAULT_LIMIT,
  ),
};
