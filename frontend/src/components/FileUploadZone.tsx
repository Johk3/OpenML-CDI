import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { UploadCloud } from 'lucide-react';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

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
        className="upload-input-hidden"
        accept={accept}
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
      <h3 className="upload-title">Drag &amp; Drop your dataset here</h3>
      <p className="upload-subtitle">or click to browse from your computer</p>
      <div className="upload-file-types">
        <Badge variant="secondary">CSV</Badge>
        <Badge variant="secondary">JSON</Badge>
        <Badge variant="secondary">ZIP</Badge>
      </div>
    </motion.div>
  );
};
