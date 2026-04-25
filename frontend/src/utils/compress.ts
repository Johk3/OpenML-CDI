import CompressWorker from './compress.worker.ts?worker';

export type CompressionProgressCallback = (percent: number) => void;

// Compress many files to a signle zip, delegate CPU intensive work to a worker
// Read files sequentially and report progress of compression via onProgress
export function compressFilesToZip(
  files: File[],
  zipName: string,
  onProgress?: CompressionProgressCallback,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const worker = new CompressWorker();
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress?.(msg.percent as number);
      } else if (msg.type === 'done') {
        resolve(new File([msg.data as Blob], zipName, { type: 'application/zip' }));
        worker.terminate();
      } else if (msg.type === 'error') {
        reject(new Error(msg.message as string));
        worker.terminate();
      }
    };
    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };
    // Send files to the worker
    worker.postMessage({ files });
  });
}
