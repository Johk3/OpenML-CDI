import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UploadPage } from '../../src/pages/UploadPage';
import { renderWithRouter, mockNavigate } from '../utils';
import { mockDatasetService } from '../mocks/datasetService';
import { compressFilesToZip } from '@/utils/compress';
import { calculateSha256Checksums } from '@/utils/fileChecksums';

const createLargeFile = () =>
  new File([new Uint8Array(9 * 1024 * 1024)], 'data.csv', { type: 'text/csv' });

vi.mock('@/utils/compress', () => ({
  compressFilesToZip: vi.fn(async (_files: File[], zipName: string) => {
    return new File(['zip'], zipName, { type: 'application/zip' });
  }),
}));

vi.mock('@/utils/fileChecksums', () => ({
  calculateSha256Checksums: vi.fn(async (files: File[]) =>
    files.map(() => 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  ),
}));

const fileWithRelativePath = (content: string, name: string, relativePath: string, type = '') => {
  const file = new File([content], name, { type });
  Object.defineProperty(file, 'webkitRelativePath', {
    configurable: true,
    value: relativePath,
  });
  return file;
};

describe('UploadPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    mockNavigate.mockClear();
    renderWithRouter(<UploadPage />);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('when a file is selected', () => {
    beforeEach(() => {
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      const file = new File(['hello'], 'hello.csv', { type: 'text/csv' });
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    it('displays the contact form heading', () => {
      expect(screen.getByText('Almost there!')).toBeInTheDocument();
    });

    it('displays the selected file name', () => {
      expect(screen.getByText('1 file selected')).toBeInTheDocument();
    });

    it('prefills contact fields from the signed-in GitHub profile', () => {
      expect(screen.getByLabelText(/First Name/i)).toHaveValue('Test');
      expect(screen.getByLabelText(/Last Name/i)).toHaveValue('User');
      expect(screen.getByLabelText(/Email Address/i)).toHaveValue('test@test.com');

      expect(document.querySelector('label[for="first-name"] .text-destructive')).toBeNull();
      expect(document.querySelector('label[for="last-name"] .text-destructive')).toBeNull();
      expect(document.querySelector('label[for="email-address"] .text-destructive')).toBeNull();
    });

    it('shows required indicators only for empty contact fields', () => {
      fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: '' } });

      expect(document.querySelector('label[for="first-name"] .text-destructive')).not.toBeNull();
      expect(document.querySelector('label[for="last-name"] .text-destructive')).toBeNull();
      expect(document.querySelector('label[for="email-address"] .text-destructive')).toBeNull();
    });

    it('displays folder-specific selection feedback when directory paths are present', () => {
      const changeButton = screen.getByText('Change');
      fireEvent.click(changeButton);

      const folderInput = document.getElementById('folder-input') as HTMLInputElement;
      const files = [
        fileWithRelativePath('one', 'one.csv', 'dataset/train/one.csv', 'text/csv'),
        fileWithRelativePath('two', 'two.csv', 'dataset/test/two.csv', 'text/csv'),
      ];
      fireEvent.change(folderInput, { target: { files } });

      expect(screen.getByText('Folder "dataset" selected')).toBeInTheDocument();
      expect(screen.getByText(/Directory paths will be preserved/i)).toBeInTheDocument();
      expect(screen.getByText('dataset/train/one.csv')).toBeInTheDocument();
      expect(screen.getByText('dataset/test/two.csv')).toBeInTheDocument();
    });

    it('displays compression feedback for multi-file selections', () => {
      const changeButton = screen.getByText('Change');
      fireEvent.click(changeButton);

      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      const files = [
        new File(['one'], 'one.csv', { type: 'text/csv' }),
        new File(['two'], 'two.csv', { type: 'text/csv' }),
      ];
      fireEvent.change(fileInput, { target: { files } });

      expect(screen.getByText('2 files selected')).toBeInTheDocument();
      expect(screen.getByText(/will be packed into one ZIP archive/i)).toBeInTheDocument();
    });

    describe('when the user clicks "Change" file', () => {
      beforeEach(() => {
        const changeButton = screen.getByText('Change');
        fireEvent.click(changeButton);
      });

      it('returns to the initial upload state', () => {
        expect(screen.getByText('Share Your Dataset')).toBeInTheDocument();
      });
    });
  });

  describe('when submitting the form successfully', () => {
    beforeEach(() => {
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      const file = new File(['success'], 'data.csv', { type: 'text/csv' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      fireEvent.change(screen.getByLabelText(/Dataset Name/i), { target: { value: 'My Dataset' } });
      fireEvent.change(screen.getByLabelText(/Description/i), {
        target: { value: 'Some description' },
      });
      fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'John' } });
      fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Doe' } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'john@example.com' },
      });
    });

    it('processes the upload and shows the completion state', async () => {
      const uploadButton = screen.getByText(/Upload Dataset/i);
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('Upload Complete!')).toBeInTheDocument();
      });

      expect(screen.getByText('John')).toBeInTheDocument();
    });

    it('sends computed SHA-256 checksums with the upload metadata', async () => {
      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(mockDatasetService.requestUploadUrl).toHaveBeenCalled();
      });

      expect(calculateSha256Checksums).toHaveBeenCalled();
      expect(mockDatasetService.requestUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          checksums: ['sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
        }),
      );
    });

    it('prompts uploaders to complete known metadata after upload', async () => {
      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(screen.getByText('Upload Complete!')).toBeInTheDocument();
      });

      expect(screen.getByText(/enter as much known metadata as possible/i)).toBeInTheDocument();
      expect(
        screen.getByText(/dataset contents, collection method, creators/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/license, publication dates, files, and known limitations/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/incomplete metadata may delay expert review/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /complete metadata/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /finish later/i })).not.toBeInTheDocument();
    });

    it('routes the success action to metadata completion', async () => {
      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(screen.getByText('Upload Complete!')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /complete metadata/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/metadata', {
        state: { datasetId: 'test-dataset-id' },
      });
    });

    it('still links to My Datasets from the success notice', async () => {
      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(screen.getByText('Upload Complete!')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /my datasets/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/datasets');
    });

    it('sends original directory paths in upload metadata when files are zipped', async () => {
      const changeButton = screen.getByText('Change');
      fireEvent.click(changeButton);

      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      const files = [
        fileWithRelativePath('one', 'one.csv', 'dataset/train/one.csv', 'text/csv'),
        fileWithRelativePath('two', 'two.csv', 'dataset/test/two.csv', 'text/csv'),
      ];
      fireEvent.change(fileInput, { target: { files } });

      fireEvent.change(screen.getByLabelText(/Dataset Name/i), {
        target: { value: 'Folder Dataset' },
      });
      fireEvent.change(screen.getByLabelText(/Description/i), {
        target: { value: 'Folder description' },
      });
      fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
      fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Doe' } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'jane@example.com' },
      });

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(mockDatasetService.requestUploadUrl).toHaveBeenCalled();
      });

      expect(compressFilesToZip).toHaveBeenCalledWith(
        files,
        'Folder_Dataset_files.zip',
        expect.any(Function),
      );
      expect(mockDatasetService.requestUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          byte_sizes: [3],
          directory_structure: {
            compressed: true,
            representation: 'zip',
            root: 'dataset',
            paths: ['dataset/train/one.csv', 'dataset/test/two.csv'],
            archive_path: 'Folder_Dataset_files.zip',
            manifest: {
              version: 1,
              path_count: 2,
              source: 'browser-selection',
            },
          },
        }),
      );
    });

    it('uses a null package root when selected folders do not share one root', async () => {
      fireEvent.click(screen.getByText('Change'));

      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      const files = [
        fileWithRelativePath('one', 'one.csv', 'cats/train/one.csv', 'text/csv'),
        fileWithRelativePath('two', 'two.csv', 'dogs/test/two.csv', 'text/csv'),
      ];
      fireEvent.change(fileInput, { target: { files } });

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(mockDatasetService.requestUploadUrl).toHaveBeenCalled();
      });

      expect(mockDatasetService.requestUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          directory_structure: expect.objectContaining({
            root: null,
            paths: ['cats/train/one.csv', 'dogs/test/two.csv'],
          }),
        }),
      );
    });

    it('uses multipart upload controls while a large file is uploading', async () => {
      fireEvent.click(screen.getByText('Change'));
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [createLargeFile()] } });
      mockDatasetService.uploadFileMultipart.mockImplementation(() => new Promise(() => undefined));
      mockDatasetService.requestUploadUrl.mockResolvedValueOnce({
        id: 'test-dataset-id',
        presigned_urls: ['http://example.com/presigned'],
        upload_contracts: [
          {
            original_path: 'data.csv',
            object_key: 'quarantine/batch/data.csv',
            url: 'http://example.com/presigned',
            method: 'PUT',
            headers: { 'Content-Type': 'text/csv' },
            content_type: 'text/csv',
            expires_seconds: 3600,
          },
        ],
      });

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(screen.getByText('Chunk 0 of 1')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /pause upload/i })).toBeInTheDocument();
      expect(mockDatasetService.uploadFileMultipart).toHaveBeenCalled();
      expect(mockDatasetService.uploadFileToPresignedUrl).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /pause upload/i }));
      expect(await screen.findByRole('button', { name: /resume upload/i })).toBeInTheDocument();
    });

    it('shows retrying feedback during multipart part retry', async () => {
      fireEvent.click(screen.getByText('Change'));
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [createLargeFile()] } });
      mockDatasetService.uploadFileMultipart.mockImplementationOnce(
        async (_datasetId, _contract, file, options) => {
          options?.onProgress?.({
            loadedBytes: file.size / 2,
            totalBytes: file.size,
            chunkIndex: 1,
            totalChunks: 2,
            status: 'retrying',
          });
          await new Promise(() => undefined);
        },
      );

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      expect(await screen.findByText(/Retrying after a network interruption/i)).toBeInTheDocument();
    });

    it('shows a canceled state when a multipart upload is canceled', async () => {
      fireEvent.click(screen.getByText('Change'));
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [createLargeFile()] } });
      mockDatasetService.uploadFileMultipart.mockImplementationOnce(
        async (_datasetId, _contract, file, options) => {
          options?.onProgress?.({
            loadedBytes: file.size / 2,
            totalBytes: file.size,
            chunkIndex: 1,
            totalChunks: 2,
            status: 'uploading',
          });
          await new Promise((_resolve, reject) => {
            const originalAbort = options?.controller?.abort;
            if (options?.controller) {
              options.controller.abort = () => {
                originalAbort?.();
                reject(new DOMException('Upload aborted', 'AbortError'));
              };
            }
          });
        },
      );

      fireEvent.click(screen.getByText(/Upload Dataset/i));
      const cancelButton = await screen.findByRole('button', { name: /cancel upload/i });
      fireEvent.click(cancelButton);

      expect(await screen.findByText('Upload Canceled')).toBeInTheDocument();
      expect(screen.queryByText('Upload Failed')).not.toBeInTheDocument();
      expect(mockDatasetService.confirmUpload).not.toHaveBeenCalled();
    });

    it('uses the direct PUT path for small files and confirms after upload', async () => {
      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(mockDatasetService.confirmUpload).toHaveBeenCalledWith('test-dataset-id');
      });

      expect(mockDatasetService.uploadFileToPresignedUrl).toHaveBeenCalledWith(
        'http://example.com/presigned',
        expect.any(File),
        expect.any(Function),
        { 'Content-Type': 'text/csv' },
      );
      expect(mockDatasetService.uploadFileMultipart).not.toHaveBeenCalled();
    });

    it('keeps the contact form open when the dataset name already exists', async () => {
      mockDatasetService.requestUploadUrl.mockRejectedValueOnce({
        response: {
          status: 409,
          data: { detail: 'Dataset with this name already exists' },
        },
      });

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'A dataset named "My Dataset" already exists. Choose a different dataset name and try again.',
        );
      });

      expect(screen.getByText('Almost there!')).toBeInTheDocument();
      expect(screen.getByLabelText(/Dataset Name/i)).toHaveValue('My Dataset');
      expect(screen.queryByText('Upload Failed')).not.toBeInTheDocument();
      expect(mockDatasetService.uploadFileToPresignedUrl).not.toHaveBeenCalled();
      expect(mockDatasetService.confirmUpload).not.toHaveBeenCalled();
    });

    it('checks existing user datasets before uploading a duplicate dataset name', async () => {
      mockDatasetService.listDatasets.mockResolvedValueOnce([
        {
          id: 'existing-dataset-id',
          title: 'My Dataset',
        },
      ]);

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'A dataset named "My Dataset" already exists. Choose a different dataset name and try again.',
        );
      });

      expect(mockDatasetService.listDatasets).toHaveBeenCalledWith({ scope: 'mine' });
      expect(mockDatasetService.requestUploadUrl).not.toHaveBeenCalled();
      expect(mockDatasetService.uploadFileToPresignedUrl).not.toHaveBeenCalled();
      expect(mockDatasetService.confirmUpload).not.toHaveBeenCalled();
    });

    it('keeps a finalizing loading screen visible while upload confirmation is pending', async () => {
      let resolveConfirmation: () => void = () => undefined;
      mockDatasetService.confirmUpload.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveConfirmation = resolve;
        }),
      );

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(mockDatasetService.confirmUpload).toHaveBeenCalledWith('test-dataset-id');
      });

      expect(screen.queryByText('Upload Complete!')).not.toBeInTheDocument();
      expect(screen.getByText('Finalizing upload…')).toBeInTheDocument();
      expect(screen.getByText(/verifying your uploaded files/i)).toBeInTheDocument();
      expect(screen.getByText('Upload complete')).toBeInTheDocument();
      expect(screen.getByText('Verifying file metadata')).toBeInTheDocument();
      expect(screen.getByText('Scanning uploaded files')).toBeInTheDocument();
      expect(screen.getByText('Saving dataset record')).toBeInTheDocument();
      expect(screen.getByText('Preparing next step')).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name: /finalization progress/i })).toHaveAttribute(
        'aria-valuenow',
        '20',
      );

      resolveConfirmation();

      await waitFor(() => {
        expect(screen.getByText('Upload Complete!')).toBeInTheDocument();
      });
    });

    it('keeps the dataset record when server-side scan finalization fails', async () => {
      mockDatasetService.confirmUpload.mockRejectedValueOnce({
        response: {
          status: 503,
          data: { detail: 'Upload scan could not be completed' },
        },
      });

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(screen.getByText('Upload Failed')).toBeInTheDocument();
      });

      expect(mockDatasetService.confirmUpload).toHaveBeenCalledWith('test-dataset-id');
      expect(mockDatasetService.deleteDataset).not.toHaveBeenCalled();
      expect(screen.getByText('Upload scan could not be completed')).toBeInTheDocument();
    });

    it('shows the finalizing loading screen while multipart completion is pending', async () => {
      fireEvent.click(screen.getByText('Change'));
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [createLargeFile()] } });
      let resolveMultipartCompletion: () => void = () => undefined;
      mockDatasetService.uploadFileMultipart.mockImplementationOnce(
        async (_datasetId, _contract, file, options) => {
          options?.onProgress?.({
            loadedBytes: file.size,
            totalBytes: file.size,
            chunkIndex: 1,
            totalChunks: 1,
            status: 'uploading',
          });
          options?.onFinalizing?.();
          options?.onProgress?.({
            loadedBytes: file.size,
            totalBytes: file.size,
            chunkIndex: 1,
            totalChunks: 1,
            status: 'finalizing',
          });
          await new Promise<void>((resolve) => {
            resolveMultipartCompletion = resolve;
          });
        },
      );

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(screen.getByText('Finalizing upload…')).toBeInTheDocument();
      });

      expect(screen.queryByText('Upload Complete!')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /pause upload/i })).not.toBeInTheDocument();

      resolveMultipartCompletion();

      await waitFor(() => {
        expect(screen.getByText('Upload Complete!')).toBeInTheDocument();
      });
      expect(mockDatasetService.confirmUpload).not.toHaveBeenCalled();
    });

    it('uses the direct PUT path for large files when the backend returns a local upload URL', async () => {
      fireEvent.click(screen.getByText('Change'));
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [createLargeFile()] } });
      mockDatasetService.requestUploadUrl.mockResolvedValueOnce({
        id: 'test-dataset-id',
        presigned_urls: ['http://localhost:8000/api/datasets/upload/datasets/batch/data.csv'],
        upload_contracts: [
          {
            original_path: 'data.csv',
            object_key: 'datasets/batch/data.csv',
            url: 'http://localhost:8000/api/datasets/upload/datasets/batch/data.csv',
            method: 'PUT',
            headers: { 'Content-Type': 'text/csv' },
            content_type: 'text/csv',
            expires_seconds: 3600,
          },
        ],
      });

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(mockDatasetService.confirmUpload).toHaveBeenCalledWith('test-dataset-id');
      });

      expect(mockDatasetService.uploadFileToPresignedUrl).toHaveBeenCalledWith(
        'http://localhost:8000/api/datasets/upload/datasets/batch/data.csv',
        expect.any(File),
        expect.any(Function),
        { 'Content-Type': 'text/csv' },
      );
      expect(mockDatasetService.uploadFileMultipart).not.toHaveBeenCalled();
    });

    it('does not confirm upload when multipart completion fails', async () => {
      fireEvent.click(screen.getByText('Change'));
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [createLargeFile()] } });
      mockDatasetService.uploadFileMultipart.mockRejectedValueOnce(
        new Error(
          'Upload failed while sending part 2 of 3. Please check your connection and resume the upload.',
        ),
      );
      mockDatasetService.requestUploadUrl.mockResolvedValueOnce({
        id: 'test-dataset-id',
        presigned_urls: ['http://example.com/presigned'],
        upload_contracts: [
          {
            original_path: 'data.csv',
            object_key: 'quarantine/batch/data.csv',
            url: 'http://example.com/presigned',
            method: 'PUT',
            headers: { 'Content-Type': 'text/csv' },
            content_type: 'text/csv',
            expires_seconds: 3600,
          },
        ],
      });

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(screen.getByText('Upload Failed')).toBeInTheDocument();
      });

      expect(mockDatasetService.confirmUpload).not.toHaveBeenCalled();
      expect(screen.getByText(/Upload failed while sending part 2 of 3/i)).toBeInTheDocument();
    });

    it('keeps the dataset record after a recoverable multipart upload failure', async () => {
      fireEvent.click(screen.getByText('Change'));
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [createLargeFile()] } });
      mockDatasetService.uploadFileMultipart.mockRejectedValueOnce(
        new Error(
          'Upload failed while sending part 2 of 3. Please check your connection and resume the upload.',
        ),
      );

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(screen.getByText('Upload Failed')).toBeInTheDocument();
      });

      expect(mockDatasetService.confirmUpload).not.toHaveBeenCalled();
      expect(mockDatasetService.deleteDataset).not.toHaveBeenCalled();
    });

    it('deletes the pre-created dataset record when direct upload fails', async () => {
      mockDatasetService.uploadFileToPresignedUrl.mockRejectedValueOnce(
        new Error('Storage upload failed'),
      );

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(screen.getByText('Upload Failed')).toBeInTheDocument();
      });

      expect(mockDatasetService.deleteDataset).toHaveBeenCalledWith('test-dataset-id');
      expect(mockDatasetService.confirmUpload).not.toHaveBeenCalled();
    });
  });
});
