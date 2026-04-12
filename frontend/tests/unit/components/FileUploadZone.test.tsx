import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileUploadZone } from '@/components/FileUploadZone';

describe('FileUploadZone component', () => {
  it('renders correctly', () => {
    render(<FileUploadZone onFileSelect={vi.fn()} />);
    expect(screen.getByText('Drag & Drop your dataset here')).toBeInTheDocument();
  });

  it('highlights when a file is dragged over', () => {
    render(<FileUploadZone onFileSelect={vi.fn()} />);
    const zone = screen.getByText('Drag & Drop your dataset here').parentElement;

    fireEvent.dragEnter(zone!);
    expect(zone).toHaveClass('active');

    fireEvent.dragLeave(zone!);
    expect(zone).not.toHaveClass('active');
  });

  it('calls onFileSelect when a file is dropped', () => {
    const handleFileSelect = vi.fn();
    render(<FileUploadZone onFileSelect={handleFileSelect} />);
    const zone = screen.getByText('Drag & Drop your dataset here').parentElement;

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
});
