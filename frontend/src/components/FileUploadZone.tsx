import React, { useState, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { FolderOpen, UploadCloud, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CONFIG } from '@/constants/config';

/** Maximum file size in bytes */
const MAX_FILE_SIZE_BYTES = CONFIG.FILE_UPLOAD_LIMIT_BYTES;

interface FileUploadZoneProps {
  onFilesSelect: (files: File[]) => void;
  className?: string;
}

type DropUploadKind = 'files' | 'folder';

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
};

type FileSystemFileEntryLike = FileSystemEntryLike & {
  isFile: true;
  file: (success: (file: File) => void, error?: (err: DOMException) => void) => void;
};

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  isDirectory: true;
  createReader: () => FileSystemDirectoryReaderLike;
};

type FileSystemDirectoryReaderLike = {
  readEntries: (
    success: (entries: FileSystemEntryLike[]) => void,
    error?: (err: DOMException) => void,
  ) => void;
};

type DataTransferItemWithEntry = DataTransferItem & {
  getAsEntry?: () => FileSystemEntryLike | null;
  webkitGetAsEntry?: () => FileSystemEntryLike | null;
};

const joinUploadPath = (...segments: string[]) =>
  segments
    .filter(Boolean)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

const attachRelativePath = (file: File, relativePath: string) => {
  if (!relativePath || file.webkitRelativePath === relativePath) return file;

  const defineRelativePath = (target: File) => {
    Object.defineProperty(target, 'webkitRelativePath', {
      configurable: true,
      value: relativePath,
    });
    return target;
  };

  try {
    return defineRelativePath(file);
  } catch {
    const clonedFile = new File([file], file.name, {
      lastModified: file.lastModified,
      type: file.type,
    });
    try {
      return defineRelativePath(clonedFile);
    } catch {
      return file;
    }
  }
};

const getEntryFromItem = (item: DataTransferItem): FileSystemEntryLike | null => {
  const itemWithEntry = item as DataTransferItemWithEntry;
  return itemWithEntry.getAsEntry?.() ?? itemWithEntry.webkitGetAsEntry?.() ?? null;
};

const getDropUploadKind = (dataTransfer?: DataTransfer): DropUploadKind => {
  const items = Array.from(dataTransfer?.items ?? []);
  const hasDirectory = items.some((item) => getEntryFromItem(item)?.isDirectory);
  return hasDirectory ? 'folder' : 'files';
};

const readFileEntry = (entry: FileSystemFileEntryLike, relativePath: string) =>
  new Promise<File>((resolve, reject) => {
    entry.file(
      (file) => resolve(attachRelativePath(file, relativePath)),
      (err) => reject(err),
    );
  });

const readDirectoryBatch = (reader: FileSystemDirectoryReaderLike) =>
  new Promise<FileSystemEntryLike[]>((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });

const readAllDirectoryEntries = async (entry: FileSystemDirectoryEntryLike) => {
  const reader = entry.createReader();
  const entries: FileSystemEntryLike[] = [];

  while (true) {
    const batch = await readDirectoryBatch(reader);
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
};

const traverseEntry = async (entry: FileSystemEntryLike, parentPath = ''): Promise<File[]> => {
  const entryPath = joinUploadPath(parentPath, entry.name);

  if (entry.isFile) {
    return [await readFileEntry(entry as FileSystemFileEntryLike, entryPath)];
  }

  if (!entry.isDirectory) return [];

  const childEntries = await readAllDirectoryEntries(entry as FileSystemDirectoryEntryLike);
  const files = await Promise.all(childEntries.map((child) => traverseEntry(child, entryPath)));
  return files.flat();
};

const collectDroppedFiles = async (dataTransfer: DataTransfer) => {
  const items = Array.from(dataTransfer.items ?? []);

  if (items.length > 0) {
    const droppedFiles = await Promise.all(
      items.map(async (item) => {
        if (item.kind !== 'file') return [];

        const entry = getEntryFromItem(item);
        if (entry) return traverseEntry(entry);

        const file = item.getAsFile();
        return file ? [file] : [];
      }),
    );
    const files = droppedFiles.flat();
    if (files.length > 0) return files;
  }

  return Array.from(dataTransfer.files ?? []);
};

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({ onFilesSelect, className }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [dropUploadKind, setDropUploadKind] = useState<DropUploadKind>('files');
  const [sizeError, setSizeError] = useState<string | null>(null);

  const validateAndSelect = useCallback(
    (files: FileList | File[]) => {
      setSizeError(null);
      const validFiles: File[] = [];

      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setSizeError(
            `File "${file.name}" exceeds the ${MAX_FILE_SIZE_BYTES / 1024 / 1024 / 1024} GB limit.`,
          );
          return;
        }
        validFiles.push(file);
      }

      if (validFiles.length === 0) {
        setSizeError('No files were found in the selected folder.');
        return;
      }

      onFilesSelect(validFiles);
    },
    [onFilesSelect],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
    setDropUploadKind(getDropUploadKind(e.dataTransfer));
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    setDropUploadKind('files');
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      setDropUploadKind('files');

      if (!e.dataTransfer) {
        setSizeError('No files were found in the dropped item.');
        return;
      }

      if ((e.dataTransfer.items?.length ?? 0) === 0 && e.dataTransfer.files.length > 0) {
        validateAndSelect(e.dataTransfer.files);
        return;
      }

      try {
        const files = await collectDroppedFiles(e.dataTransfer);
        validateAndSelect(files);
      } catch {
        setSizeError('Could not read the dropped folder. Try browsing for it instead.');
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

  const openFilePicker = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    fileInputRef.current?.click();
  }, []);

  const openFolderPicker = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    folderInputRef.current?.click();
  }, []);

  const handleZoneClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input')) return;

      openFilePicker();
    },
    [openFilePicker],
  );

  const isFolderDrag = isDragActive && dropUploadKind === 'folder';
  const UploadIcon = isFolderDrag ? FolderOpen : UploadCloud;

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
        onClick={handleZoneClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          id="file-input"
          className="upload-input-hidden"
          onChange={handleChange}
          aria-hidden="true"
          tabIndex={-1}
          hidden
          title=""
          multiple
        />
        <input
          ref={folderInputRef}
          type="file"
          id="folder-input"
          className="upload-input-hidden"
          webkitdirectory=""
          directory=""
          onChange={handleChange}
          aria-hidden="true"
          tabIndex={-1}
          hidden
          title=""
        />
        <motion.div
          className="upload-icon-container"
          animate={{ y: isDragActive ? -5 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <UploadIcon size={40} />
        </motion.div>
        <h3 className="upload-title">
          {isFolderDrag ? 'Drop folder to upload' : 'Drag & Drop your datasets here'}
        </h3>
        {isFolderDrag ? (
          <p className="upload-subtitle">
            Release to queue every nested file. Folder paths will be preserved.
          </p>
        ) : (
          <p className="upload-subtitle">
            or click to browse{' '}
            <button type="button" className="upload-browse-link" onClick={openFilePicker}>
              files
            </button>{' '}
            or{' '}
            <button type="button" className="upload-browse-link" onClick={openFolderPicker}>
              folders
            </button>
          </p>
        )}
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
