import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileUploadZone } from '@/components/FileUploadZone';
import { CONFIG } from '@/constants/config';

type MockFileEntry = {
  isFile: true;
  isDirectory: false;
  name: string;
  file: (success: (file: File) => void) => void;
};

type MockDirectoryEntry = {
  isFile: false;
  isDirectory: true;
  name: string;
  createReader: () => {
    readEntries: (success: (entries: MockEntry[]) => void) => void;
  };
};

type MockEntry = MockFileEntry | MockDirectoryEntry;

const fileEntry = (file: File): MockFileEntry => ({
  isFile: true,
  isDirectory: false,
  name: file.name,
  file: (success) => success(file),
});

const directoryEntry = (name: string, entries: MockEntry[]): MockDirectoryEntry => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader: () => {
    let hasRead = false;
    return {
      readEntries: (success) => {
        success(hasRead ? [] : entries);
        hasRead = true;
      },
    };
  },
});

const folderDataTransfer = (entry: MockDirectoryEntry) => ({
  files: [],
  items: [
    {
      kind: 'file',
      webkitGetAsEntry: () => entry,
      getAsFile: () => null,
    },
  ],
});

describe('FileUploadZone component', () => {
  const LIMIT_GB = CONFIG.FILE_UPLOAD_LIMIT_BYTES / 1024 / 1024 / 1024;

  it('does not set an accept attribute on the file input', () => {
    render(<FileUploadZone onFilesSelect={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toHaveAttribute('accept');
  });

  it('highlights when a file is dragged over', () => {
    render(<FileUploadZone onFilesSelect={vi.fn()} />);
    const zone = screen.getByText('Drag & Drop your datasets here').closest('.upload-zone');

    fireEvent.dragEnter(zone!);
    expect(zone).toHaveClass('active');

    fireEvent.dragLeave(zone!);
    expect(zone).not.toHaveClass('active');
  });

  it('shows folder-specific feedback while a folder is dragged over', () => {
    render(<FileUploadZone onFilesSelect={vi.fn()} />);
    const zone = screen.getByText('Drag & Drop your datasets here').closest('.upload-zone');
    const entry = directoryEntry('dataset', []);

    fireEvent.dragEnter(zone!, {
      dataTransfer: folderDataTransfer(entry),
    });

    expect(screen.getByText('Drop folder to upload')).toBeInTheDocument();
    expect(screen.getByText(/folder paths will be preserved/i)).toBeInTheDocument();
  });

  it('calls onFilesSelect when a file is dropped', () => {
    const handleFilesSelect = vi.fn();
    render(<FileUploadZone onFilesSelect={handleFilesSelect} />);
    const zone = screen.getByText('Drag & Drop your datasets here').closest('.upload-zone');

    const file = new File(['hello'], 'hello.csv', { type: 'text/csv' });
    fireEvent.drop(zone!, {
      dataTransfer: {
        files: [file],
      },
    });

    expect(handleFilesSelect).toHaveBeenCalledWith([file]);
    expect(handleFilesSelect).toHaveBeenCalledTimes(1);
  });

  it('traverses dropped folders and preserves nested relative paths', async () => {
    const handleFilesSelect = vi.fn();
    render(<FileUploadZone onFilesSelect={handleFilesSelect} />);
    const zone = screen.getByText('Drag & Drop your datasets here').closest('.upload-zone');

    const trainFile = new File(['one'], 'one.csv', { type: 'text/csv' });
    const testFile = new File(['two'], 'two.csv', { type: 'text/csv' });
    const entry = directoryEntry('dataset', [
      directoryEntry('train', [fileEntry(trainFile)]),
      directoryEntry('test', [fileEntry(testFile)]),
    ]);

    fireEvent.drop(zone!, {
      dataTransfer: folderDataTransfer(entry),
    });

    await waitFor(() => {
      expect(handleFilesSelect).toHaveBeenCalledTimes(1);
    });

    const selectedFiles = handleFilesSelect.mock.calls[0][0] as File[];
    expect(selectedFiles).toHaveLength(2);
    expect(selectedFiles.map((file) => file.webkitRelativePath)).toEqual([
      'dataset/train/one.csv',
      'dataset/test/two.csv',
    ]);
  });

  it('calls onFilesSelect through file input change', () => {
    const handleFilesSelect = vi.fn();
    render(<FileUploadZone onFilesSelect={handleFilesSelect} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    const file = new File(['testing'], 'test.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', {
      value: [file],
    });

    fireEvent.change(input);
    expect(handleFilesSelect).toHaveBeenCalledWith([file]);
    expect(handleFilesSelect).toHaveBeenCalledTimes(1);
  });

  it('opens the file picker when the upload zone is clicked', () => {
    render(<FileUploadZone onFilesSelect={vi.fn()} />);

    const zone = screen.getByText('Drag & Drop your datasets here').closest('.upload-zone');
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    const folderInput = document.getElementById('folder-input') as HTMLInputElement;
    const fileClick = vi.spyOn(fileInput, 'click').mockImplementation(() => undefined);
    const folderClick = vi.spyOn(folderInput, 'click').mockImplementation(() => undefined);

    fireEvent.click(zone!);

    expect(fileClick).toHaveBeenCalledTimes(1);
    expect(folderClick).not.toHaveBeenCalled();
  });

  // --- Multi-format acceptance tests ---

  describe('accepts arbitrary file formats', () => {
    it('accepts a CSV file via input change', () => {
      const handleFilesSelect = vi.fn();
      render(<FileUploadZone onFilesSelect={handleFilesSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['col1,col2\n1,2'], 'data.csv', { type: 'text/csv' });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      expect(handleFilesSelect).toHaveBeenCalledWith([file]);
    });

    it('accepts a ZIP file via input change', () => {
      const handleFilesSelect = vi.fn();
      render(<FileUploadZone onFilesSelect={handleFilesSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['PK'], 'archive.zip', { type: 'application/zip' });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      expect(handleFilesSelect).toHaveBeenCalledWith([file]);
    });

    it('accepts an XLSX file via input change', () => {
      const handleFilesSelect = vi.fn();
      render(<FileUploadZone onFilesSelect={handleFilesSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['xlsx-data'], 'spreadsheet.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      expect(handleFilesSelect).toHaveBeenCalledWith([file]);
    });

    it('accepts an HDF5 file via input change', () => {
      const handleFilesSelect = vi.fn();
      render(<FileUploadZone onFilesSelect={handleFilesSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['hdf5-data'], 'model.hdf5', {
        type: 'application/x-hdf5',
      });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      expect(handleFilesSelect).toHaveBeenCalledWith([file]);
    });

    it('accepts a ZIP file via drag-and-drop', () => {
      const handleFilesSelect = vi.fn();
      render(<FileUploadZone onFilesSelect={handleFilesSelect} />);
      const zone = screen.getByText('Drag & Drop your datasets here').closest('.upload-zone');

      const file = new File(['PK'], 'archive.zip', { type: 'application/zip' });
      fireEvent.drop(zone!, { dataTransfer: { files: [file] } });

      expect(handleFilesSelect).toHaveBeenCalledWith([file]);
    });

    it('accepts an XLSX file via drag-and-drop', () => {
      const handleFilesSelect = vi.fn();
      render(<FileUploadZone onFilesSelect={handleFilesSelect} />);
      const zone = screen.getByText('Drag & Drop your datasets here').closest('.upload-zone');

      const file = new File(['xlsx-data'], 'spreadsheet.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      fireEvent.drop(zone!, { dataTransfer: { files: [file] } });

      expect(handleFilesSelect).toHaveBeenCalledWith([file]);
    });

    it('accepts an HDF5 file via drag-and-drop', () => {
      const handleFilesSelect = vi.fn();
      render(<FileUploadZone onFilesSelect={handleFilesSelect} />);
      const zone = screen.getByText('Drag & Drop your datasets here').closest('.upload-zone');

      const file = new File(['hdf5-data'], 'model.hdf5', { type: 'application/x-hdf5' });
      fireEvent.drop(zone!, { dataTransfer: { files: [file] } });

      expect(handleFilesSelect).toHaveBeenCalledWith([file]);
    });
  });

  // --- File size limit test ---

  describe('file size validation', () => {
    it(`rejects files exceeding the ${LIMIT_GB} GB limit`, () => {
      const handleFilesSelect = vi.fn();
      render(<FileUploadZone onFilesSelect={handleFilesSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      // Create a mock file that reports itself as > current limit
      const bigFile = new File(['x'], 'huge.csv', { type: 'text/csv' });
      Object.defineProperty(bigFile, 'size', { value: CONFIG.FILE_UPLOAD_LIMIT_BYTES + 1024 });

      Object.defineProperty(input, 'files', { value: [bigFile] });
      fireEvent.change(input);

      expect(handleFilesSelect).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        new RegExp(`exceeds the ${LIMIT_GB} GB limit`, 'i'),
      );
    });

    it(`accepts files within the ${LIMIT_GB} GB limit`, () => {
      const handleFilesSelect = vi.fn();
      render(<FileUploadZone onFilesSelect={handleFilesSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['x'], 'small.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'size', { value: CONFIG.FILE_UPLOAD_LIMIT_BYTES - 1024 });

      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      expect(handleFilesSelect).toHaveBeenCalledWith([file]);
    });
  });
});
