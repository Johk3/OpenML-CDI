import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UploadPage } from '../../src/pages/UploadPage';
import { renderWithRouter, mockNavigate } from '../utils';
import { mockDatasetService } from '../mocks/datasetService';
import { compressFilesToZip } from '@/utils/compress';

vi.mock('@/utils/compress', () => ({
  compressFilesToZip: vi.fn(async (_files: File[], zipName: string) => {
    return new File(['zip'], zipName, { type: 'application/zip' });
  }),
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
    mockDatasetService.requestUploadUrl.mockResolvedValue({
      id: 'test-dataset-id',
      presigned_urls: ['http://example.com/presigned'],
    });
    mockDatasetService.uploadFileInChunks.mockImplementation(async (_url, file, options) => {
      options?.onProgress?.({
        loadedBytes: file.size,
        totalBytes: file.size,
        chunkIndex: 0,
        totalChunks: 1,
        status: 'completed',
      });
    });
    mockDatasetService.confirmUpload.mockResolvedValue(undefined);
    renderWithRouter(<UploadPage />);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders the main heading', () => {
    expect(screen.getByText('Share Your Dataset')).toBeInTheDocument();
  });

  it('renders the drag & drop text', () => {
    expect(screen.getByText(/Drag & Drop your datasets here/i)).toBeInTheDocument();
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

      expect(screen.getByText('Uploading…')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Upload Complete!')).toBeInTheDocument();
      });

      expect(screen.getByText('John')).toBeInTheDocument();
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
          description: expect.objectContaining({
            directory_structure: {
              compressed: true,
              root: 'dataset',
              paths: ['dataset/train/one.csv', 'dataset/test/two.csv'],
            },
          }),
        }),
      );
    });

    it('uses resumable chunked upload controls while a file is uploading', async () => {
      mockDatasetService.uploadFileInChunks.mockImplementation(() => new Promise(() => undefined));

      fireEvent.click(screen.getByText(/Upload Dataset/i));

      await waitFor(() => {
        expect(screen.getByText('Chunk 0 of 1')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /pause upload/i })).toBeInTheDocument();
      expect(mockDatasetService.uploadFileInChunks).toHaveBeenCalled();
      expect(mockDatasetService.uploadFileToPresignedUrl).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /pause upload/i }));
      expect(await screen.findByRole('button', { name: /resume upload/i })).toBeInTheDocument();
    });
  });
});
