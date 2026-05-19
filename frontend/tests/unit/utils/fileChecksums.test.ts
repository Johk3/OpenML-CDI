import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateSha256Checksum, calculateSha256Checksums } from '@/utils/fileChecksums';

describe('fileChecksums', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns undefined when SubtleCrypto is unavailable', async () => {
    vi.stubGlobal('crypto', {});

    const checksum = await calculateSha256Checksum(new File(['content'], 'data.csv'));

    expect(checksum).toBeUndefined();
  });

  it('formats SHA-256 digest bytes as a prefixed hex checksum', async () => {
    const digest = vi.fn().mockResolvedValue(new Uint8Array([0, 15, 16, 255]).buffer);
    vi.stubGlobal('crypto', { subtle: { digest } });

    const checksum = await calculateSha256Checksum(new File(['content'], 'data.csv'));

    expect(digest).toHaveBeenCalledWith('SHA-256', expect.any(ArrayBuffer));
    expect(checksum).toBe('sha256:000f10ff');
  });

  it('calculates checksums for each provided file', async () => {
    const digest = vi
      .fn()
      .mockResolvedValueOnce(new Uint8Array([1]).buffer)
      .mockResolvedValueOnce(new Uint8Array([2]).buffer);
    vi.stubGlobal('crypto', { subtle: { digest } });

    const checksums = await calculateSha256Checksums([
      new File(['first'], 'first.csv'),
      new File(['second'], 'second.csv'),
    ]);

    expect(checksums).toEqual(['sha256:01', 'sha256:02']);
    expect(digest).toHaveBeenCalledTimes(2);
  });
});
