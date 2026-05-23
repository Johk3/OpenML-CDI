import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetUploadContract, ChunkedUploadController } from '@/types/dataset';

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const { axiosPutMock } = vi.hoisted(() => ({
  axiosPutMock: vi.fn(),
}));

vi.mock('@/lib/apiClient', () => ({
  apiClient: apiClientMock,
}));

vi.mock('axios', () => ({
  default: {
    put: axiosPutMock,
  },
}));

const importDatasetService = async () => {
  vi.doUnmock('@/services/datasetService');
  vi.doUnmock('../../src/services/datasetService');
  const { DatasetService } = await import('../../src/services/datasetService');
  return DatasetService as typeof DatasetService & {
    uploadFileMultipart: (
      datasetId: string,
      contract: DatasetUploadContract,
      file: File,
      options?: {
        chunkSize?: number;
        concurrency?: number;
        controller?: ChunkedUploadController;
        maxRetries?: number;
        retryDelayMs?: number;
        onProgress?: (progress: {
          loadedBytes: number;
          totalBytes: number;
          chunkIndex: number;
          totalChunks: number;
          status: string;
        }) => void;
      },
    ) => Promise<void>;
  };
};

const contract: DatasetUploadContract = {
  original_path: 'large.csv',
  object_key: 'quarantine/batch/large.csv',
  url: 'https://signed.example/single',
  method: 'PUT',
  headers: { 'Content-Type': 'text/csv' },
  content_type: 'text/csv',
  expires_seconds: 3600,
};

const createFile = (content = 'abcdefghijkl') =>
  new File([content], 'large.csv', {
    type: 'text/csv',
    lastModified: 1_774_000_000,
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const mockMultipartApi = (partSize = 5) => {
  apiClientMock.post.mockImplementation((url: string, payload: unknown) => {
    if (url === '/datasets/dataset-1/multipart-uploads') {
      return Promise.resolve({
        data: {
          dataset_id: 'dataset-1',
          object_key: contract.object_key,
          upload_id: 'upload-1',
          part_size: partSize,
          expires_seconds: 3600,
          status: 'active',
        },
      });
    }

    if (url.includes('/parts/') && url.endsWith('/url')) {
      const partNumber = Number(url.match(/\/parts\/(\d+)\/url$/)?.[1]);
      return Promise.resolve({
        data: {
          url: `https://signed.example/upload-1/${partNumber}`,
          method: 'PUT',
          headers: {},
          expires_seconds: 3600,
        },
      });
    }

    if (url === '/datasets/dataset-1/multipart-uploads/upload-1/complete') {
      return Promise.resolve({ data: { message: 'completed' } });
    }

    return Promise.reject(new Error(`Unexpected POST ${url} ${JSON.stringify(payload)}`));
  });

  apiClientMock.get.mockResolvedValue({
    data: {
      object_key: contract.object_key,
      upload_id: 'upload-1',
      parts: [],
    },
  });

  apiClientMock.delete.mockResolvedValue(undefined);
  axiosPutMock.mockImplementation(
    (
      url: string,
      body: Blob,
      config?: { onUploadProgress?: (event: { loaded: number }) => void },
    ) => {
      const partNumber = Number(url.split('/').pop());
      config?.onUploadProgress?.({ loaded: Math.ceil(body.size / 2) });
      config?.onUploadProgress?.({ loaded: body.size });
      return Promise.resolve({ headers: { etag: `"etag-${partNumber}"` } });
    },
  );
};

describe('DatasetService multipart uploads', () => {
  beforeEach(() => {
    vi.resetModules();
    apiClientMock.delete.mockReset();
    apiClientMock.get.mockReset();
    apiClientMock.post.mockReset();
    apiClientMock.put.mockReset();
    axiosPutMock.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uploads large files as S3 multipart parts and completes with collected ETags', async () => {
    const DatasetService = await importDatasetService();
    const file = createFile();
    const progressEvents: { loadedBytes: number; totalBytes: number; status: string }[] = [];
    mockMultipartApi();

    await DatasetService.uploadFileMultipart('dataset-1', contract, file, {
      chunkSize: 5,
      concurrency: 2,
      onProgress: (progress) => progressEvents.push(progress),
    });

    expect(apiClientMock.post).toHaveBeenCalledWith('/datasets/dataset-1/multipart-uploads', {
      object_key: contract.object_key,
      content_type: 'text/csv',
      part_size: 5,
    });
    expect(axiosPutMock).toHaveBeenCalledTimes(3);
    expect(apiClientMock.post).toHaveBeenCalledWith(
      '/datasets/dataset-1/multipart-uploads/upload-1/complete',
      {
        object_key: contract.object_key,
        parts: [
          { part_number: 1, etag: 'etag-1' },
          { part_number: 2, etag: 'etag-2' },
          { part_number: 3, etag: 'etag-3' },
        ],
      },
    );
    expect(progressEvents.at(-1)).toMatchObject({
      loadedBytes: file.size,
      totalBytes: file.size,
      status: 'completed',
    });
    expect(Math.max(...progressEvents.map((event) => event.loadedBytes))).toBe(file.size);
    expect(window.localStorage.length).toBe(0);
  });

  it('pauses the multipart queue before starting the next part and resumes later', async () => {
    vi.useFakeTimers();
    const DatasetService = await importDatasetService();
    const file = createFile();
    const progressEvents: string[] = [];
    let paused = true;
    const controller: ChunkedUploadController = {
      pause: () => {
        paused = true;
      },
      resume: () => {
        paused = false;
      },
      abort: vi.fn(),
      isPaused: () => paused,
    };
    mockMultipartApi();

    const upload = DatasetService.uploadFileMultipart('dataset-1', contract, file, {
      chunkSize: 5,
      concurrency: 1,
      controller,
      onProgress: (progress) => progressEvents.push(progress.status),
    });

    await vi.waitFor(() => {
      expect(progressEvents).toContain('paused');
    });
    expect(axiosPutMock).not.toHaveBeenCalled();

    controller.resume();
    await vi.advanceTimersByTimeAsync(100);
    await upload;

    expect(progressEvents).toContain('resumed');
    expect(axiosPutMock).toHaveBeenCalledTimes(3);
  });

  it('resumes a stored upload session without initiating a new upload', async () => {
    const DatasetService = await importDatasetService();
    const file = createFile();
    mockMultipartApi();
    axiosPutMock.mockImplementationOnce(
      (
        _url: string,
        body: Blob,
        config?: { onUploadProgress?: (event: { loaded: number }) => void },
      ) => {
        config?.onUploadProgress?.({ loaded: body.size });
        return Promise.resolve({ headers: { etag: '"etag-1"' } });
      },
    );
    axiosPutMock.mockRejectedValueOnce(new Error('network down'));

    await expect(
      DatasetService.uploadFileMultipart('dataset-1', contract, file, {
        chunkSize: 5,
        concurrency: 1,
        maxRetries: 1,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/part 2/i);

    apiClientMock.post.mockClear();
    axiosPutMock.mockReset();
    apiClientMock.get.mockResolvedValue({
      data: {
        object_key: contract.object_key,
        upload_id: 'upload-1',
        parts: [{ part_number: 1, etag: 'etag-1', size: 5 }],
      },
    });
    axiosPutMock.mockImplementation((url: string, body: Blob) =>
      Promise.resolve({ headers: { etag: `"etag-${url.split('/').pop()}"` }, data: body }),
    );

    await DatasetService.uploadFileMultipart('dataset-1', contract, file, {
      chunkSize: 5,
      concurrency: 1,
    });

    expect(apiClientMock.post).not.toHaveBeenCalledWith(
      '/datasets/dataset-1/multipart-uploads',
      expect.anything(),
    );
    expect(apiClientMock.get).toHaveBeenCalledWith(
      '/datasets/dataset-1/multipart-uploads/upload-1/parts',
      { params: { object_key: contract.object_key } },
    );
    expect(axiosPutMock).toHaveBeenCalledTimes(2);
  });

  it('retries failed part uploads with a fresh part URL before surfacing an error', async () => {
    const DatasetService = await importDatasetService();
    const file = createFile('abcdef');
    const statuses: string[] = [];
    mockMultipartApi(6);
    axiosPutMock.mockRejectedValueOnce(new Error('temporary outage')).mockResolvedValueOnce({
      headers: { etag: '"etag-1"' },
    });

    await DatasetService.uploadFileMultipart('dataset-1', contract, file, {
      chunkSize: 6,
      concurrency: 1,
      maxRetries: 2,
      retryDelayMs: 0,
      onProgress: (progress) => statuses.push(progress.status),
    });

    expect(apiClientMock.post).toHaveBeenCalledTimes(4);
    expect(apiClientMock.post).toHaveBeenCalledWith(
      '/datasets/dataset-1/multipart-uploads/upload-1/parts/1/url',
      { object_key: contract.object_key },
    );
    expect(statuses).toContain('retrying');
  });

  it('aborts the backend multipart session and clears local state when canceled', async () => {
    const DatasetService = await importDatasetService();
    const file = createFile();
    let uploadStarted: () => void;
    const started = new Promise<void>((resolve) => {
      uploadStarted = resolve;
    });
    const controller: ChunkedUploadController = {
      pause: vi.fn(),
      resume: vi.fn(),
      abort: vi.fn(),
      isPaused: () => false,
    };
    mockMultipartApi();
    axiosPutMock.mockImplementation(
      (_url: string, _body: Blob, config?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          uploadStarted();
          config?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Upload aborted', 'AbortError'));
          });
        }),
    );

    const upload = DatasetService.uploadFileMultipart('dataset-1', contract, file, {
      chunkSize: 5,
      concurrency: 1,
      controller,
    });
    await started;

    controller.abort();

    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    expect(apiClientMock.delete).toHaveBeenCalledWith(
      '/datasets/dataset-1/multipart-uploads/upload-1',
      { params: { object_key: contract.object_key } },
    );
    expect(window.localStorage.length).toBe(0);
  });

  it('aborts the backend multipart session when canceled before setup completes', async () => {
    const DatasetService = await importDatasetService();
    const file = createFile();
    const initiateUpload = deferred<{
      data: {
        dataset_id: string;
        object_key: string;
        upload_id: string;
        part_size: number;
        expires_seconds: number;
        status: string;
      };
    }>();
    const controller: ChunkedUploadController = {
      pause: vi.fn(),
      resume: vi.fn(),
      abort: vi.fn(),
      isPaused: () => false,
    };

    apiClientMock.post.mockImplementation((url: string) => {
      if (url === '/datasets/dataset-1/multipart-uploads') {
        return initiateUpload.promise;
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });
    apiClientMock.get.mockResolvedValue({
      data: { object_key: contract.object_key, upload_id: 'upload-1', parts: [] },
    });
    apiClientMock.delete.mockResolvedValue(undefined);

    const upload = DatasetService.uploadFileMultipart('dataset-1', contract, file, {
      chunkSize: 5,
      concurrency: 1,
      controller,
    });

    controller.abort();
    initiateUpload.resolve({
      data: {
        dataset_id: 'dataset-1',
        object_key: contract.object_key,
        upload_id: 'upload-1',
        part_size: 5,
        expires_seconds: 3600,
        status: 'active',
      },
    });

    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    expect(apiClientMock.delete).toHaveBeenCalledWith(
      '/datasets/dataset-1/multipart-uploads/upload-1',
      { params: { object_key: contract.object_key } },
    );
    expect(apiClientMock.get).not.toHaveBeenCalled();
    expect(axiosPutMock).not.toHaveBeenCalled();
  });

  it('falls back to listed part metadata when browser CORS hides the upload ETag', async () => {
    const DatasetService = await importDatasetService();
    const file = createFile('abcdef');
    mockMultipartApi(6);
    apiClientMock.get
      .mockResolvedValueOnce({
        data: { object_key: contract.object_key, upload_id: 'upload-1', parts: [] },
      })
      .mockResolvedValueOnce({
        data: {
          object_key: contract.object_key,
          upload_id: 'upload-1',
          parts: [{ part_number: 1, etag: 'etag-from-list', size: 6 }],
        },
      });
    axiosPutMock.mockResolvedValueOnce({ headers: {} });

    await DatasetService.uploadFileMultipart('dataset-1', contract, file, {
      chunkSize: 6,
      concurrency: 1,
    });

    expect(apiClientMock.get).toHaveBeenCalledTimes(2);
    expect(apiClientMock.post).toHaveBeenCalledWith(
      '/datasets/dataset-1/multipart-uploads/upload-1/complete',
      {
        object_key: contract.object_key,
        parts: [{ part_number: 1, etag: 'etag-from-list' }],
      },
    );
  });

  it('does not retry sibling uploads canceled after a terminal part failure', async () => {
    const DatasetService = await importDatasetService();
    const file = createFile('abcdefghij');
    const partTwoStarted = deferred<void>();
    mockMultipartApi(5);
    axiosPutMock.mockImplementation(
      (
        url: string,
        _body: Blob,
        config?: { signal?: AbortSignal; onUploadProgress?: (event: { loaded: number }) => void },
      ) => {
        const partNumber = Number(url.split('/').pop());
        if (partNumber === 1) {
          return Promise.reject(new Error('permanent part failure'));
        }
        partTwoStarted.resolve();
        return new Promise((_resolve, reject) => {
          config?.signal?.addEventListener('abort', () => {
            reject({ name: 'CanceledError', code: 'ERR_CANCELED' });
          });
        });
      },
    );

    await expect(
      DatasetService.uploadFileMultipart('dataset-1', contract, file, {
        chunkSize: 5,
        concurrency: 2,
        maxRetries: 2,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/part 1/i);
    await partTwoStarted.promise;

    expect(apiClientMock.post).toHaveBeenCalledWith(
      '/datasets/dataset-1/multipart-uploads/upload-1/parts/2/url',
      { object_key: contract.object_key },
    );
    expect(
      apiClientMock.post.mock.calls.filter(
        ([url]) => url === '/datasets/dataset-1/multipart-uploads/upload-1/parts/2/url',
      ),
    ).toHaveLength(1);
  });
});

describe('DatasetService direct uploads', () => {
  beforeEach(() => {
    vi.resetModules();
    apiClientMock.put.mockReset();
    axiosPutMock.mockReset();
  });

  it('uses the authenticated API client for local backend upload URLs', async () => {
    const DatasetService = await importDatasetService();
    const file = createFile('small');
    const onProgress = vi.fn();
    const uploadUrl = 'http://localhost:8000/api/datasets/upload/datasets/batch/small.csv';
    apiClientMock.put.mockResolvedValue({ data: { message: 'Upload successful' } });

    await DatasetService.uploadFileToPresignedUrl(uploadUrl, file, onProgress);

    expect(apiClientMock.put).toHaveBeenCalledWith(uploadUrl, file, {
      headers: { 'Content-Type': 'text/csv' },
      onUploadProgress: onProgress,
    });
    expect(axiosPutMock).not.toHaveBeenCalled();
  });

  it('uses plain axios for external presigned storage URLs', async () => {
    const DatasetService = await importDatasetService();
    const file = createFile('small');
    const onProgress = vi.fn();
    const uploadUrl = 'https://signed.example/object/small.csv';
    axiosPutMock.mockResolvedValue({ headers: {} });

    await DatasetService.uploadFileToPresignedUrl(uploadUrl, file, onProgress);

    expect(axiosPutMock).toHaveBeenCalledWith(uploadUrl, file, {
      headers: { 'Content-Type': 'text/csv' },
      onUploadProgress: onProgress,
    });
    expect(apiClientMock.put).not.toHaveBeenCalled();
  });

  it('merges upload contract headers into direct PUT requests', async () => {
    const DatasetService = await importDatasetService();
    const file = createFile('small');
    const uploadUrl = 'https://signed.example/object/small.csv';
    axiosPutMock.mockResolvedValue({ headers: {} });

    await DatasetService.uploadFileToPresignedUrl(uploadUrl, file, undefined, {
      'x-amz-checksum-sha256': 'checksum',
    });

    expect(axiosPutMock).toHaveBeenCalledWith(uploadUrl, file, {
      headers: {
        'Content-Type': 'text/csv',
        'x-amz-checksum-sha256': 'checksum',
      },
      onUploadProgress: undefined,
    });
  });

  it('does not choose multipart for local backend upload URLs even when the file is large', async () => {
    const DatasetService = await importDatasetService();
    const file = new File([new Uint8Array(9 * 1024 * 1024)], 'large.zip', {
      type: 'application/zip',
    });

    expect(
      DatasetService.shouldUseMultipartUpload(file, {
        ...contract,
        url: 'http://localhost:8000/api/datasets/upload/datasets/batch/large.zip',
      }),
    ).toBe(false);
  });

  it('uploads the complete object with one PUT for standard upload URLs', async () => {
    const DatasetService = await importDatasetService();
    const file = new File([new Uint8Array(9 * 1024 * 1024)], 'large.zip', {
      type: 'application/zip',
    });
    const uploadUrl = '/api/datasets/upload/datasets/batch/large.zip';
    apiClientMock.put.mockResolvedValue({ data: {} });

    await DatasetService.uploadFileInChunks(uploadUrl, file);

    expect(apiClientMock.put).toHaveBeenCalledTimes(1);
    expect(apiClientMock.put).toHaveBeenCalledWith(
      uploadUrl,
      file,
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/zip',
        },
      }),
    );
  });

  it('uses the backend upload mode when deciding whether multipart is available', async () => {
    const DatasetService = await importDatasetService();
    const file = new File([new Uint8Array(9 * 1024 * 1024)], 'large.zip', {
      type: 'application/zip',
    });

    expect(
      DatasetService.shouldUseMultipartUpload(file, {
        ...contract,
        upload_mode: 'direct',
      }),
    ).toBe(false);
    expect(
      DatasetService.shouldUseMultipartUpload(file, {
        ...contract,
        upload_mode: 'multipart',
      }),
    ).toBe(true);
  });
});

describe('DatasetService dataset endpoint contracts', () => {
  beforeEach(() => {
    vi.resetModules();
    apiClientMock.get.mockReset();
    apiClientMock.post.mockReset();
  });

  it('uses current backend endpoints for dataset API calls', async () => {
    const DatasetService = await importDatasetService();
    const dataset = { id: 'dataset-1', title: 'Dataset One' };
    const datasets = [dataset];
    const response = { status_code: 200, message: 'ok' };
    const uploadPayload = {
      name: 'Dataset One',
      filenames: ['data.csv'],
    };
    const metadata = { name: 'Dataset One' };

    apiClientMock.post.mockResolvedValue({ data: response });
    apiClientMock.get.mockImplementation((url: string) =>
      Promise.resolve({ data: url === '/datasets/list' ? datasets : dataset }),
    );

    await expect(DatasetService.requestUploadUrl(uploadPayload)).resolves.toBe(response);
    await expect(DatasetService.confirmUpload('dataset-1')).resolves.toBe(response);
    await expect(DatasetService.updateMetadata('dataset-1', metadata)).resolves.toBe(response);
    await expect(DatasetService.deleteDataset('dataset-1')).resolves.toBe(response);
    await expect(DatasetService.updateStatus('dataset-1', 'approved')).resolves.toBe(response);
    await expect(DatasetService.getDataset('dataset-1')).resolves.toBe(dataset);
    await expect(DatasetService.listDatasets({ scope: 'mine' })).resolves.toBe(datasets);

    expect(apiClientMock.post).toHaveBeenCalledWith('/datasets/upload-url', uploadPayload);
    expect(apiClientMock.post).toHaveBeenCalledWith('/datasets/dataset-1/confirm-upload');
    expect(apiClientMock.post).toHaveBeenCalledWith('/datasets/metadata', metadata, {
      params: { dataset_id: 'dataset-1' },
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/datasets/delete', null, {
      params: { dataset_id: 'dataset-1' },
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/datasets/status', null, {
      params: { dataset_id: 'dataset-1', status: 'approved' },
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/datasets/dataset-1');
    expect(apiClientMock.get).toHaveBeenCalledWith('/datasets/list', {
      params: { scope: 'mine' },
    });
  });
});

describe('DatasetService downloads', () => {
  beforeEach(() => {
    vi.resetModules();
    apiClientMock.get.mockReset();
  });

  it('prefers RFC 5987 download filenames from content-disposition', async () => {
    const DatasetService = await importDatasetService();
    const blob = new Blob(['content'], { type: 'text/csv' });
    apiClientMock.get.mockResolvedValue({
      data: blob,
      headers: {
        'content-disposition':
          'attachment; filename="fallback.csv"; filename*=UTF-8\'\'R%C3%A9sum%C3%A9%20%CE%94.csv',
      },
    });

    await expect(DatasetService.downloadDataset('dataset-1')).resolves.toEqual({
      blob,
      filename: 'Résumé Δ.csv',
    });
  });

  it('throws the backend detail message from blob error responses', async () => {
    const DatasetService = await importDatasetService();
    apiClientMock.get.mockRejectedValue({
      response: {
        data: new Blob([JSON.stringify({ detail: 'Dataset file is missing from storage' })], {
          type: 'application/json',
        }),
      },
    });

    await expect(DatasetService.downloadDataset('dataset-1')).rejects.toThrow(
      'Dataset file is missing from storage',
    );
  });
});
