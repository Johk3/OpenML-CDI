import React, { useState, useCallback } from 'react';
import { UploadCloud } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  className?: string;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  onFileSelect,
  accept = '.csv,.json,.zip',
  className,
}) => {
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFileSelect(e.dataTransfer.files[0]);
      }
    },
    [onFileSelect],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onFileSelect(e.target.files[0]);
      }
    },
    [onFileSelect],
  );

  return (
    <div
      className={twMerge(clsx('upload-zone', isDragActive && 'active', className))}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        className="upload-input-hidden"
        accept={accept}
        onChange={handleChange}
        title=""
      />
      <div className="upload-icon-container">
        <UploadCloud size={40} />
      </div>
      <h3 className="upload-title">Drag & Drop your dataset here</h3>
      <p className="upload-subtitle">or click to browse from your computer</p>
      <div className="upload-file-types">
        <span className="file-badge">CSV</span>
        <span className="file-badge">JSON</span>
        <span className="file-badge">ZIP</span>
      </div>
    </div>
  );
};
