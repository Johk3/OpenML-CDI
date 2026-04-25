import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { UploadCloud, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CONFIG } from '@/constants/config';

/** Maximum file size in bytes */
const MAX_FILE_SIZE_BYTES = CONFIG.FILE_UPLOAD_LIMIT_BYTES;

interface FileUploadZoneProps {
  onFilesSelect: (files: File[]) => void;
  className?: string;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({ onFilesSelect, className }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);

  const validateAndSelect = useCallback(
    (files: FileList) => {
      setSizeError(null);
      const validFiles: File[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setSizeError(
            `File "${file.name}" exceeds the ${MAX_FILE_SIZE_BYTES / 1024 / 1024 / 1024} GB limit.`,
          );
          return;
        }
        validFiles.push(file);
      }

      onFilesSelect(validFiles);
    },
    [onFilesSelect],
  );

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
        validateAndSelect(e.dataTransfer.files);
      }
    },
    [validateAndSelect],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        validateAndSelect(e.target.files);
      }
    },
    [validateAndSelect],
  );

  return (
    <div>
      <motion.div
        animate={{
          scale: isDragActive ? 1.02 : 1,
          borderColor: isDragActive ? 'var(--primary)' : 'inherit',
        }}
        transition={{ duration: 0.2 }}
        className={cn('upload-zone', isDragActive && 'active', className)}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-input"
          className="upload-input-hidden"
          onChange={handleChange}
          title=""
          multiple
        />
        <input
          type="file"
          id="folder-input"
          className="upload-input-hidden"
          webkitdirectory=""
          directory=""
          onChange={handleChange}
          title=""
        />
        <motion.div
          className="upload-icon-container"
          animate={{ y: isDragActive ? -5 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <UploadCloud size={40} />
        </motion.div>
        <h3 className="upload-title">Drag &amp; Drop your datasets here</h3>
        <p className="upload-subtitle">
          or click to browse{' '}
          <label htmlFor="file-input" className="upload-browse-link">
            files
          </label>{' '}
          or{' '}
          <label htmlFor="folder-input" className="upload-browse-link">
            folders
          </label>
        </p>
        <p className="upload-any-format">All file formats accepted</p>

        {sizeError && (
          <p className="upload-size-error" role="alert">
            {sizeError}
          </p>
        )}
      </motion.div>

      <div className="upload-processing-notice">
        <Info size={14} className="upload-processing-notice-icon" />
        <span>
          Processing support may vary depending on your submission format so you'll see the status
          after submission.
        </span>
      </div>
    </div>
  );
};
