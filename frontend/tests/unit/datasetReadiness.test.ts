import { describe, expect, it } from 'vitest';

import { hasReviewReadyFiles } from '@/lib/datasetReadiness';

describe('datasetReadiness', () => {
  it('requires promoted downloadable objects before treating files as review-ready', () => {
    const rawMetadata = {
      objects: [
        {
          upload_state: 'uploaded',
          scan_state: 'clean',
          download_state: 'downloadable',
          final_object_key: 'ready/dataset/data.csv',
        },
      ],
    };

    expect(hasReviewReadyFiles({ rawMetadata })).toBe(false);

    rawMetadata.objects[0].upload_state = 'promoted';

    expect(hasReviewReadyFiles({ rawMetadata })).toBe(true);
  });

  it('does not fall back to legacy scan metadata when object metadata is present but not promoted', () => {
    const rawMetadata = {
      objects: [
        {
          upload_state: 'uploaded',
          scan_state: 'clean',
          download_state: 'downloadable',
          final_object_key: 'ready/dataset/data.csv',
        },
      ],
      malware_scan: {
        files: [{ file: 'data.csv', status: 'clean' }],
      },
    };

    expect(hasReviewReadyFiles({ rawMetadata })).toBe(false);
  });
});
