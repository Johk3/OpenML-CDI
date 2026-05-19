function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function calculateSha256Checksum(file: File): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;

  const buffer = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return `sha256:${bytesToHex(digest)}`;
}

export async function calculateSha256Checksums(files: File[]): Promise<(string | undefined)[]> {
  return Promise.all(files.map((file) => calculateSha256Checksum(file)));
}
