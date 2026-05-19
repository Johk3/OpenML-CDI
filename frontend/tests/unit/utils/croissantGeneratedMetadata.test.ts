import { describe, expect, it } from 'vitest';
import type { BackendDataset } from '@/types/dataset';
import { buildCroissantFormDataFromDataset } from '@/utils/croissantGeneratedMetadata';

describe('buildCroissantFormDataFromDataset', () => {
  it('prefills dataset fields from the upload record without publishing private contact metadata', () => {
    const dataset = {
      id: 'dataset-1',
      title: 'Heart Signals',
      status: 'uploaded',
      owner_id: 'user-1',
      issue_url: '',
      created_at: '2026-05-01T12:30:00Z',
      dataset_metadata: {
        description: {
          text: 'ECG measurements from wearable devices',
          contact: {
            first_name: 'Ada',
            last_name: 'Lovelace',
            email: 'ada@example.com',
          },
        },
      },
    } as BackendDataset;

    const formData = buildCroissantFormDataFromDataset(dataset, 'https://openml-cdi.test');

    expect(formData.dataset).toMatchObject({
      name: 'Heart Signals',
      description: 'ECG measurements from wearable devices',
      datePublished: '2026-05-01',
      dateCreated: '2026-05-01',
      url: 'https://openml-cdi.test/datasets/dataset-1',
    });
    expect(formData.dataset).not.toHaveProperty('creator');
    expect(JSON.stringify(formData)).not.toContain('Ada');
    expect(JSON.stringify(formData)).not.toContain('ada@example.com');
  });

  it('builds generated FileObject entries from stored upload objects', () => {
    const dataset = {
      id: 'dataset-2',
      title: 'Tabular Upload',
      status: 'uploaded',
      owner_id: 'user-1',
      issue_url: '',
      created_at: '2026-05-01T12:30:00Z',
      dataset_metadata: {
        description: 'A tabular dataset',
        objects: [
          {
            original_path: 'train.csv',
            object_key: 'ready/dataset-2/train.csv',
            content_type: 'text/csv',
            byte_size: 128,
            checksum: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          },
        ],
      },
    } as BackendDataset;

    const formData = buildCroissantFormDataFromDataset(dataset, 'https://openml-cdi.test');

    expect(formData.distribution).toEqual([
      expect.objectContaining({
        _generated: true,
        'distribution.@id': 'train.csv',
        'distribution.name': 'train.csv',
        'distribution.contentUrl': 'https://openml-cdi.test/api/datasets/dataset-2/download',
        'distribution.encodingFormat': 'text/csv',
        'distribution.contentSize': '128 B',
        'distribution.sha256': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ]);
  });

  it('builds a generated FileSet from directory package metadata', () => {
    const dataset = {
      id: 'dataset-3',
      title: 'Folder Upload',
      status: 'uploaded',
      owner_id: 'user-1',
      issue_url: '',
      created_at: '2026-05-01T12:30:00Z',
      dataset_metadata: {
        description: 'Folder dataset',
        objects: [
          {
            original_path: 'Folder_Upload_files.zip',
            object_key: 'ready/dataset-3/Folder_Upload_files.zip',
            content_type: 'application/zip',
            byte_size: 512,
            checksum: null,
          },
        ],
        directory_structure: {
          compressed: true,
          representation: 'zip',
          root: 'images',
          paths: ['images/cat.jpg', 'images/dog.jpg'],
          archive_path: 'Folder_Upload_files.zip',
          manifest: {
            version: 1,
            path_count: 2,
            source: 'browser-selection',
          },
        },
      },
    } as BackendDataset;

    const formData = buildCroissantFormDataFromDataset(dataset, 'https://openml-cdi.test');

    expect(formData.fileSet).toEqual([
      expect.objectContaining({
        _generated: true,
        'fileSet.@id': 'images',
        'fileSet.name': 'images',
        'fileSet.containedIn': 'Folder_Upload_files.zip',
        'fileSet.includes': 'images/**/*',
      }),
    ]);
  });
});
