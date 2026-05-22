import type { Dataset, DatasetStatus } from '@/types/auth';

type DatasetReadinessInput = Pick<Dataset, 'rawMetadata' | 'status'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasReviewReadyObjects = (objects: unknown): boolean => {
  if (!Array.isArray(objects) || objects.length === 0) return false;

  return objects.every(
    (object) =>
      isRecord(object) &&
      object.scan_state === 'clean' &&
      object.download_state === 'downloadable' &&
      object.upload_state === 'promoted' &&
      typeof object.final_object_key === 'string' &&
      object.final_object_key.length > 0,
  );
};

const hasCleanLegacyScan = (malwareScan: unknown): boolean => {
  if (!isRecord(malwareScan) || !Array.isArray(malwareScan.files)) return false;

  return (
    malwareScan.files.length > 0 &&
    malwareScan.files.every((file) => isRecord(file) && file.status === 'clean')
  );
};

export const hasReviewReadyFiles = (dataset: Pick<Dataset, 'rawMetadata'>): boolean => {
  const metadata = dataset.rawMetadata ?? {};
  if (Array.isArray(metadata.objects) && metadata.objects.length > 0) {
    return hasReviewReadyObjects(metadata.objects);
  }

  return hasCleanLegacyScan(metadata.malware_scan);
};

export const canReopenRejectedDataset = (dataset: DatasetReadinessInput): boolean =>
  dataset.status === ('rejected' satisfies DatasetStatus) && hasReviewReadyFiles(dataset);
