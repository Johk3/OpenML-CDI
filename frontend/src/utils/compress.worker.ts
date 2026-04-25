import { Zip, ZipPassThrough } from 'fflate';

// Yield control back to the event loop every N files.
// add a small delay to not overwhelm the whole system
const YIELD_EVERY_N_FILES = 20;
const YIELD_SLEEP_MS = 2;

// Merge output chunks periodically to avoid overwhelming the browser
const CONSOLIDATE_EVERY_N_CHUNKS = 200;
interface WorkerScope {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}
const ctx = self as unknown as WorkerScope;

interface WorkerInput {
  files: File[];
}

type WorkerOutput =
  | { type: 'progress'; percent: number }
  | { type: 'done'; data: Blob }
  | { type: 'error'; message: string };

// Use fflate to put the files into a ZIP archive using fflates streaming api
// We are NOT using compression, because
// after running several experiments with 20,000+ files(even with optimizations)
// the result was that compressing the files lead to the whole system crashing on the user-end
// As such, we use ZipPassThrough which eliminates the CPU overhead by not compressing the files
// Furthermore we consolidate and yield to the OS to make sure that the browser doesnt crash
ctx.onmessage = async (e: MessageEvent<WorkerInput>) => {
  const { files } = e.data;
  const outputBlobs: Blob[] = [];
  let chunkCount = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          reject(err);
          return;
        }

        // Copy the chunk and wrap in a Blob
        outputBlobs.push(new Blob([new Uint8Array(chunk)]));
        chunkCount++;

        // Periodically consolidate and merge all blobs
        if (chunkCount % CONSOLIDATE_EVERY_N_CHUNKS === 0) {
          const merged = new Blob(outputBlobs);
          outputBlobs.length = 0;
          outputBlobs.push(merged);
        }

        if (final) resolve();
      });

      (async () => {
        for (let i = 0; i < files.length; i++) {
          // Yield by sleeping
          if (i > 0 && i % YIELD_EVERY_N_FILES === 0) {
            await new Promise<void>((r) => setTimeout(r, YIELD_SLEEP_MS));
          }

          const file = files[i];
          const path: string =
            (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
          const entry = new ZipPassThrough(path);
          zip.add(entry);

          const buffer = await file.arrayBuffer();
          entry.push(new Uint8Array(buffer), /* final */ true);

          // Report progress
          const percent = Math.round(((i + 1) / files.length) * 100);
          ctx.postMessage({ type: 'progress', percent } satisfies WorkerOutput);
        }

        zip.end();
      })().catch(reject);
    });

    // Final merge of any remaining blobs
    const zipBlob = new Blob(outputBlobs, { type: 'application/zip' });
    ctx.postMessage({ type: 'done', data: zipBlob } satisfies WorkerOutput);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ type: 'error', message } satisfies WorkerOutput);
  }
};
