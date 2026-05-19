import type { BackendDataset, UploadDirectoryStructure } from '@/types/dataset';
import type { CroissantFormData, FormSection } from './serializeCroissant';

type DatasetMetadata = Record<string, unknown>;

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const MD5_PATTERN = /^[a-f0-9]{32}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isoDate(value: unknown): string | undefined {
  const raw = asString(value);
  return raw ? raw.slice(0, 10) : undefined;
}

function descriptionText(metadata: DatasetMetadata): string | undefined {
  const description = metadata.description;
  if (typeof description === 'string') return description;

  const descriptionRecord = asRecord(description);
  return asString(descriptionRecord?.text);
}

function checksumHashes(checksum: unknown): Partial<FormSection> {
  const raw = asString(checksum);
  if (!raw) return {};

  const [algorithm, value] = raw.includes(':') ? raw.split(':', 2) : ['', raw];
  if ((algorithm === 'sha256' || !algorithm) && SHA256_PATTERN.test(value)) {
    return { 'distribution.sha256': value };
  }
  if ((algorithm === 'md5' || !algorithm) && MD5_PATTERN.test(value)) {
    return { 'distribution.md5': value };
  }
  return {};
}

function downloadUrl(appBaseUrl: string, datasetId: string): string {
  return `${appBaseUrl.replace(/\/$/, '')}/api/datasets/${datasetId}/download`;
}

function datasetUrl(appBaseUrl: string, datasetId: string): string {
  return `${appBaseUrl.replace(/\/$/, '')}/datasets/${datasetId}`;
}

function objectDistributionItems(
  dataset: BackendDataset,
  metadata: DatasetMetadata,
  appBaseUrl: string,
): FormSection[] {
  const objects = Array.isArray(metadata.objects) ? metadata.objects : [];
  if (objects.length > 0) {
    return objects
      .map(asRecord)
      .filter((object): object is Record<string, unknown> => object !== null)
      .map((object) => {
        const byteSize = asNumber(object.byte_size);
        const name = asString(object.original_path) ?? asString(object.object_key) ?? dataset.title;
        return {
          _generated: true,
          'distribution.@id': name,
          'distribution.name': name,
          'distribution.contentUrl': downloadUrl(appBaseUrl, dataset.id),
          ...(asString(object.content_type) && {
            'distribution.encodingFormat': asString(object.content_type),
          }),
          ...(byteSize !== undefined && { 'distribution.contentSize': `${byteSize} B` }),
          ...checksumHashes(object.checksum),
        };
      });
  }

  const filenames = Array.isArray(metadata.filenames) ? metadata.filenames : [];
  const contentTypes = Array.isArray(metadata.content_types) ? metadata.content_types : [];
  const byteSizes = Array.isArray(metadata.byte_sizes) ? metadata.byte_sizes : [];
  const checksums = Array.isArray(metadata.checksums) ? metadata.checksums : [];

  return filenames.map((filename, index) => {
    const byteSize = asNumber(byteSizes[index]);
    const name = asString(filename) ?? `file-${index + 1}`;
    return {
      _generated: true,
      'distribution.@id': name,
      'distribution.name': name,
      'distribution.contentUrl': downloadUrl(appBaseUrl, dataset.id),
      ...(asString(contentTypes[index]) && {
        'distribution.encodingFormat': asString(contentTypes[index]),
      }),
      ...(byteSize !== undefined && { 'distribution.contentSize': `${byteSize} B` }),
      ...checksumHashes(checksums[index]),
    };
  });
}

function commonEncodingFormat(distribution: FormSection[]): string | undefined {
  const formats = new Set(
    distribution
      .map((item) => asString(item['distribution.encodingFormat']))
      .filter((format): format is string => Boolean(format)),
  );
  return formats.size === 1 ? [...formats][0] : undefined;
}

function fileSetItemsFromDirectoryStructure(
  metadata: DatasetMetadata,
  distribution: FormSection[],
): FormSection[] {
  const directoryStructure = asRecord(
    metadata.directory_structure,
  ) as UploadDirectoryStructure | null;
  if (!directoryStructure || !Array.isArray(directoryStructure.paths)) return [];

  const root = asString(directoryStructure.root);
  const archivePath = asString(directoryStructure.archive_path);
  const name = root ?? archivePath ?? 'uploaded-files';
  const includePattern = root ? `${root}/**/*` : '**/*';

  return [
    {
      _generated: true,
      'fileSet.@id': name,
      'fileSet.name': name,
      'fileSet.description': `Files selected during upload (${directoryStructure.paths.length} paths).`,
      'fileSet.includes': includePattern,
      ...(archivePath && { 'fileSet.containedIn': archivePath }),
      ...(commonEncodingFormat(distribution) && {
        'fileSet.encodingFormat': commonEncodingFormat(distribution),
      }),
    },
  ];
}

export function buildCroissantFormDataFromDataset(
  dataset: BackendDataset,
  appBaseUrl = window.location.origin,
): CroissantFormData {
  const metadata = dataset.dataset_metadata ?? {};
  const createdDate = isoDate(dataset.created_at);
  const distribution = objectDistributionItems(dataset, metadata, appBaseUrl);

  return {
    dataset: {
      name: dataset.title,
      ...(descriptionText(metadata) && { description: descriptionText(metadata) }),
      ...(createdDate && { datePublished: createdDate, dateCreated: createdDate }),
      url: datasetUrl(appBaseUrl, dataset.id),
    },
    distribution,
    fileSet: fileSetItemsFromDirectoryStructure(metadata, distribution),
    recordSet: [],
    rai: {},
  };
}

function mergeRecordList<T extends Record<string, unknown>>(base: T[], override: T[]): T[] {
  return override.length > 0 ? override : base;
}

export function mergeCroissantFormData(
  generated: CroissantFormData,
  existing: CroissantFormData,
): CroissantFormData {
  return {
    dataset: { ...generated.dataset, ...existing.dataset },
    distribution: mergeRecordList(generated.distribution, existing.distribution),
    fileSet: mergeRecordList(generated.fileSet, existing.fileSet),
    recordSet: mergeRecordList(generated.recordSet, existing.recordSet),
    rai: { ...generated.rai, ...existing.rai },
  };
}
