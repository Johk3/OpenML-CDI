import { afterEach, describe, expect, it, vi } from 'vitest';

async function importConfig() {
  vi.resetModules();
  return (await import('@/constants/config')).CONFIG;
}

describe('CONFIG', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses the default upload limit when the env value is empty', async () => {
    vi.stubEnv('VITE_FILE_UPLOAD_LIMIT', '');

    const config = await importConfig();

    expect(config.FILE_UPLOAD_LIMIT_BYTES).toBe(500 * 1024 * 1024);
  });

  it('parses multiplication expressions from the upload limit env value', async () => {
    vi.stubEnv('VITE_FILE_UPLOAD_LIMIT', '2 * 1024 * 1024');

    const config = await importConfig();

    expect(config.FILE_UPLOAD_LIMIT_BYTES).toBe(2 * 1024 * 1024);
  });

  it('falls back to the default upload limit for invalid expressions', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubEnv('VITE_FILE_UPLOAD_LIMIT', '500 * nope');

    const config = await importConfig();

    expect(config.FILE_UPLOAD_LIMIT_BYTES).toBe(500 * 1024 * 1024);
    expect(warn).toHaveBeenCalledWith(
      'Failed to parse config expression: "500 * nope". Using fallback: 524288000',
      expect.any(Error),
    );
  });
});
