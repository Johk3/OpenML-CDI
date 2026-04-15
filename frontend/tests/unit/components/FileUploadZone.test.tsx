import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileUploadZone } from '@/components/FileUploadZone';
import { CONFIG } from '@/constants/config';

describe('FileUploadZone component', () => {
  const LIMIT_GB = CONFIG.FILE_UPLOAD_LIMIT_BYTES / 1024 / 1024 / 1024;

  it('renders correctly', () => {
    render(<FileUploadZone onFileSelect={vi.fn()} />);
    expect(screen.getByText('Drag & Drop your dataset here')).toBeInTheDocument();
  });

  it('displays the all-formats-accepted label', () => {
    render(<FileUploadZone onFileSelect={vi.fn()} />);
    expect(screen.getByText('All file formats accepted')).toBeInTheDocument();
  });

  it('displays the processing support notice', () => {
    render(<FileUploadZone onFileSelect={vi.fn()} />);
    expect(screen.getByText(/processing support may vary/i)).toBeInTheDocument();
  });

  it('does not set an accept attribute on the file input', () => {
    render(<FileUploadZone onFileSelect={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toHaveAttribute('accept');
  });

  it('highlights when a file is dragged over', () => {
    render(<FileUploadZone onFileSelect={vi.fn()} />);
    const zone = screen.getByText('Drag & Drop your dataset here').closest('.upload-zone');

    fireEvent.dragEnter(zone!);
    expect(zone).toHaveClass('active');

    fireEvent.dragLeave(zone!);
    expect(zone).not.toHaveClass('active');
  });

  it('calls onFileSelect when a file is dropped', () => {
    const handleFileSelect = vi.fn();
    render(<FileUploadZone onFileSelect={handleFileSelect} />);
    const zone = screen.getByText('Drag & Drop your dataset here').closest('.upload-zone');

    const file = new File(['hello'], 'hello.csv', { type: 'text/csv' });
    fireEvent.drop(zone!, {
      dataTransfer: {
        files: [file],
      },
    });

    expect(handleFileSelect).toHaveBeenCalledWith(file);
    expect(handleFileSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onFileSelect through file input change', () => {
    const handleFileSelect = vi.fn();
    render(<FileUploadZone onFileSelect={handleFileSelect} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    const file = new File(['testing'], 'test.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', {
      value: [file],
    });

    fireEvent.change(input);
    expect(handleFileSelect).toHaveBeenCalledWith(file);
    expect(handleFileSelect).toHaveBeenCalledTimes(1);
  });

  // --- Multi-format acceptance tests ---

  describe('accepts arbitrary file formats', () => {
    it('accepts a CSV file via input change', () => {
      const handleFileSelect = vi.fn();
      render(<FileUploadZone onFileSelect={handleFileSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['col1,col2\n1,2'], 'data.csv', { type: 'text/csv' });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      expect(handleFileSelect).toHaveBeenCalledWith(file);
    });

    it('accepts a ZIP file via input change', () => {
      const handleFileSelect = vi.fn();
      render(<FileUploadZone onFileSelect={handleFileSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['PK'], 'archive.zip', { type: 'application/zip' });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      expect(handleFileSelect).toHaveBeenCalledWith(file);
    });

    it('accepts an XLSX file via input change', () => {
      const handleFileSelect = vi.fn();
      render(<FileUploadZone onFileSelect={handleFileSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['xlsx-data'], 'spreadsheet.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      expect(handleFileSelect).toHaveBeenCalledWith(file);
    });

    it('accepts an HDF5 file via input change', () => {
      const handleFileSelect = vi.fn();
      render(<FileUploadZone onFileSelect={handleFileSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['hdf5-data'], 'model.hdf5', {
        type: 'application/x-hdf5',
      });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      expect(handleFileSelect).toHaveBeenCalledWith(file);
    });

    it('accepts a ZIP file via drag-and-drop', () => {
      const handleFileSelect = vi.fn();
      render(<FileUploadZone onFileSelect={handleFileSelect} />);
      const zone = screen.getByText('Drag & Drop your dataset here').closest('.upload-zone');

      const file = new File(['PK'], 'archive.zip', { type: 'application/zip' });
      fireEvent.drop(zone!, { dataTransfer: { files: [file] } });

      expect(handleFileSelect).toHaveBeenCalledWith(file);
    });

    it('accepts an XLSX file via drag-and-drop', () => {
      const handleFileSelect = vi.fn();
      render(<FileUploadZone onFileSelect={handleFileSelect} />);
      const zone = screen.getByText('Drag & Drop your dataset here').closest('.upload-zone');

      const file = new File(['xlsx-data'], 'spreadsheet.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      fireEvent.drop(zone!, { dataTransfer: { files: [file] } });

      expect(handleFileSelect).toHaveBeenCalledWith(file);
    });

    it('accepts an HDF5 file via drag-and-drop', () => {
      const handleFileSelect = vi.fn();
      render(<FileUploadZone onFileSelect={handleFileSelect} />);
      const zone = screen.getByText('Drag & Drop your dataset here').closest('.upload-zone');

      const file = new File(['hdf5-data'], 'model.hdf5', { type: 'application/x-hdf5' });
      fireEvent.drop(zone!, { dataTransfer: { files: [file] } });

      expect(handleFileSelect).toHaveBeenCalledWith(file);
    });
  });

  // --- File size limit test ---

  describe('file size validation', () => {
    it(`rejects files exceeding the ${LIMIT_GB} GB limit`, () => {
      const handleFileSelect = vi.fn();
      render(<FileUploadZone onFileSelect={handleFileSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      // Create a mock file that reports itself as > current limit
      const bigFile = new File(['x'], 'huge.csv', { type: 'text/csv' });
      Object.defineProperty(bigFile, 'size', { value: CONFIG.FILE_UPLOAD_LIMIT_BYTES + 1024 });

      Object.defineProperty(input, 'files', { value: [bigFile] });
      fireEvent.change(input);

      expect(handleFileSelect).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        new RegExp(`exceeds the ${LIMIT_GB} GB limit`, 'i'),
      );
    });

    it(`accepts files within the ${LIMIT_GB} GB limit`, () => {
      const handleFileSelect = vi.fn();
      render(<FileUploadZone onFileSelect={handleFileSelect} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['x'], 'small.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'size', { value: CONFIG.FILE_UPLOAD_LIMIT_BYTES - 1024 });

      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      expect(handleFileSelect).toHaveBeenCalledWith(file);
    });
  });
});
