import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileUploadZone } from '../components/FileUploadZone';
import { Input } from '../components/Input';
import {
  CheckCircle,
  FileText,
  ArrowRight,
  Upload,
  Info,
  Clock,
  XCircle,
  Package,
  PauseCircle,
  PlayCircle,
  FolderOpen,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUserContext } from '@/hooks/useUserContext';
import { DatasetService } from '@/services/datasetService';
import { AxiosError } from 'axios';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { compressFilesToZip } from '@/utils/compress';
import { calculateSha256Checksums } from '@/utils/fileChecksums';
import {
  ChunkedUploadController,
  ChunkedUploadProgress,
  DatasetUploadContract,
  UploadDirectoryStructure,
} from '@/types/dataset';

type UploadState =
  | 'idle'
  | 'contact'
  | 'compressing'
  | 'uploading'
  | 'finalizing'
  | 'success'
  | 'canceled'
  | 'error';
type UploadSessionState =
  | 'idle'
  | 'uploading'
  | 'paused'
  | 'resumed'
  | 'retrying'
  | 'finalizing'
  | 'completed'
  | 'aborted';

const getUploadPath = (file: File) => file.webkitRelativePath || file.name;

const getDirectoryRoot = (paths: string[]) => {
  const firstRoot = paths[0]?.includes('/') ? paths[0].split('/')[0] : null;
  if (!firstRoot) return null;
  return paths.every((path) => path.startsWith(`${firstRoot}/`)) ? firstRoot : null;
};

const buildUploadDirectoryStructure = (
  originalPaths: string[],
  uploadedFiles: File[],
  compressed: boolean,
): UploadDirectoryStructure | undefined => {
  const root = getDirectoryRoot(originalPaths);
  if (!compressed && originalPaths.length === 1 && root === null) return undefined;

  return {
    compressed,
    representation: compressed
      ? 'zip'
      : originalPaths.length > 1
        ? 'multi_object'
        : 'single_object',
    root,
    paths: originalPaths,
    archive_path: compressed ? getUploadPath(uploadedFiles[0]) : null,
    manifest: {
      version: 1,
      path_count: originalPaths.length,
      source: 'browser-selection',
    },
  };
};

const isUploadCanceledError = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'AbortError') return true;

  const maybeError = error as { name?: unknown } | null | undefined;
  return maybeError?.name === 'AbortError';
};

const getUploadErrorDetail = (error: unknown) => {
  const axiosError = error as AxiosError<{ detail?: unknown }>;
  const detail = axiosError.response?.data?.detail;
  return typeof detail === 'string' ? detail : null;
};

const isDuplicateDatasetNameError = (error: unknown, detail: string | null) => {
  const axiosError = error as AxiosError;
  return axiosError.response?.status === 409 && /already exists|duplicate/i.test(detail ?? '');
};

const duplicateDatasetNameMessage = (name: string) => {
  const displayName = name.trim();
  if (!displayName) {
    return 'A dataset with this name already exists. Choose a different dataset name and try again.';
  }

  return `A dataset named "${displayName}" already exists. Choose a different dataset name and try again.`;
};

const normalizeDatasetName = (name: string) => name.trim().toLocaleLowerCase();

const uploadSessionMessage = (
  state: UploadSessionState,
  fileName: string | null,
  fallbackFileName: string | undefined,
) => {
  const displayName = fileName ?? fallbackFileName ?? 'file';

  switch (state) {
    case 'paused':
      return 'Upload paused. Resume to continue from the saved chunk.';
    case 'resumed':
      return 'Upload resumed from saved progress.';
    case 'retrying':
      return 'Retrying after a network interruption. Completed chunks stay saved.';
    case 'finalizing':
      return 'Completing the multipart upload and verifying the object.';
    case 'completed':
      return 'Upload completed. Preparing the dataset record.';
    case 'aborted':
      return 'Upload canceled. Cleaning up saved progress.';
    default:
      return `Uploading chunks for ${displayName}.`;
  }
};

const TIPS = [
  'Multiple files are automatically compressed into a single ZIP archive before uploading, making the transfer faster and giving you a single file to share with your expert.',
  'If you run into any troubles or have found new ways to describe your dataset, be sure to contact your assigned expert for guidance.',
  'Large datasets? Using a stable wired connection can prevent upload interruptions.',
  'Please do not close the site! Otherwise your upload will be interrupted.',
  'Remember to fill in the Croissant Metadata to the best of your ability, this will help the expert greatly!',
];

const FINALIZATION_STEPS = [
  'Upload complete',
  'Verifying file metadata',
  'Scanning uploaded files',
  'Saving dataset record',
  'Preparing next step',
];

const TipsCarousel: React.FC = () => {
  const [current, setCurrent] = useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % TIPS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mt-8 h-32 flex items-center justify-center max-w-md mx-auto">
      <AnimatePresence mode="wait">
        <motion.p
          key={current}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
          className="text-sm text-muted-foreground/80 italic px-4 leading-relaxed font-medium"
        >
          <span className="text-primary not-italic font-bold mr-1">Tip:</span>
          {TIPS[current]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
};

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUserContext();
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [originalFileCount, setOriginalFileCount] = useState(0);
  const [uploadSessionState, setUploadSessionState] = useState<UploadSessionState>('idle');
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(1);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [hasMultipartControls, setHasMultipartControls] = useState(false);
  const [finalizationStepIndex, setFinalizationStepIndex] = useState(0);
  const uploadControllerRef = useRef<ChunkedUploadController | null>(null);

  // Prevention of accidental page closure during compression or upload
  React.useEffect(() => {
    if (
      uploadState === 'compressing' ||
      uploadState === 'uploading' ||
      uploadState === 'finalizing'
    ) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = '';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [uploadState]);

  React.useEffect(() => {
    if (uploadState !== 'finalizing') {
      setFinalizationStepIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setFinalizationStepIndex((current) => Math.min(current + 1, FINALIZATION_STEPS.length - 1));
    }, 2500);

    return () => window.clearInterval(timer);
  }, [uploadState]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    firstName: '',
    lastName: '',
    email: '',
  });

  React.useEffect(() => {
    if (!user) return;

    setFormData((current) => ({
      ...current,
      firstName: current.firstName.trim() ? current.firstName : user.first_name.trim(),
      lastName: current.lastName.trim() ? current.lastName : user.last_name.trim(),
      email: current.email.trim() ? current.email : user.email.trim(),
    }));
  }, [user]);

  const selectedPaths = selectedFiles.map(getUploadPath);
  const selectedDirectoryRoot = getDirectoryRoot(selectedPaths);
  const hasDirectorySelection = selectedPaths.some((path) => path.includes('/'));
  const willCompressSelection = selectedFiles.length > 1;
  const selectionPackageFeedback = hasDirectorySelection
    ? willCompressSelection
      ? 'Directory paths will be preserved inside the ZIP archive.'
      : 'Directory paths will be preserved.'
    : willCompressSelection
      ? 'Files will be packed into one ZIP archive before upload.'
      : '';
  const finalizationProgress = Math.round(
    ((finalizationStepIndex + 1) / FINALIZATION_STEPS.length) * 100,
  );

  // Concurrency helper for large batches
  const runWithLimit = async <T,>(limit: number, tasks: (() => Promise<T>)[]): Promise<T[]> => {
    const results: T[] = new Array(tasks.length);
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (index < tasks.length) {
        const i = index++;
        results[i] = await tasks[i]();
      }
    });
    await Promise.all(workers);
    return results;
  };

  const handleFilesSelect = (files: File[]) => {
    if (!user) {
      navigate('/login', { state: { from: location } });
      return;
    }
    setErrorMessage(null);
    setSelectedFiles(files);
    setUploadState('contact');
  };

  const ensureDatasetNameAvailable = async () => {
    const requestedName = normalizeDatasetName(formData.name);
    if (!requestedName) return true;

    try {
      const existingDatasets = await DatasetService.listDatasets({ scope: 'mine' });
      const duplicateExists = existingDatasets.some(
        (dataset) => normalizeDatasetName(dataset.title) === requestedName,
      );
      if (!duplicateExists) return true;
    } catch (error) {
      console.warn('Could not check existing dataset names before upload:', error);
      return true;
    }

    setErrorMessage(duplicateDatasetNameMessage(formData.name));
    setUploadState('contact');
    return false;
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0 || !user) return;

    setErrorMessage(null);
    setUploadProgress(0);
    setCompressionProgress(0);
    setUploadSessionState('idle');
    setCurrentChunk(0);
    setTotalChunks(1);
    setUploadedFileName(null);
    setHasMultipartControls(false);
    setFinalizationStepIndex(0);
    setOriginalFileCount(selectedFiles.length);
    let createdDatasetId: string | null = null;
    let usedMultipartUpload = false;
    let directUploadFinalizationStarted = false;

    try {
      const restorableSelectedFileSession =
        selectedFiles.length === 1
          ? DatasetService.getRestorableMultipartUpload(selectedFiles[0])
          : null;
      if (!restorableSelectedFileSession && !(await ensureDatasetNameAvailable())) {
        return;
      }

      // Compress
      let filesToUpload: File[];

      if (selectedFiles.length > 1) {
        setUploadState('compressing');
        const zipName = `${formData.name.replace(/[^a-z0-9_-]/gi, '_') || 'dataset'}_files.zip`;
        const zipFile = await compressFilesToZip(selectedFiles, zipName, (pct) =>
          setCompressionProgress(pct),
        );
        filesToUpload = [zipFile];
      } else {
        filesToUpload = selectedFiles;
      }

      // Request presigned urls
      setUploadState('uploading');
      const checksums = await calculateSha256Checksums(filesToUpload);
      const uploadChecksums = checksums.some(Boolean) ? checksums : undefined;

      const restorableMultipartSession =
        filesToUpload.length === 1
          ? (restorableSelectedFileSession ??
            DatasetService.getRestorableMultipartUpload(filesToUpload[0]))
          : null;
      const uploadResponse = restorableMultipartSession
        ? {
            id: restorableMultipartSession.datasetId,
            presigned_urls: [''],
            upload_contracts: [
              DatasetService.uploadContractFromSession(restorableMultipartSession),
            ],
          }
        : await DatasetService.requestUploadUrl({
            name: formData.name,
            description: {
              text: formData.description,
              contact: {
                first_name: formData.firstName,
                last_name: formData.lastName,
                email: formData.email,
              },
            },
            filenames: filesToUpload.map(getUploadPath),
            content_types: filesToUpload.map((f) => f.type || undefined),
            byte_sizes: filesToUpload.map((f) => f.size),
            checksums: uploadChecksums,
            directory_structure: buildUploadDirectoryStructure(
              selectedPaths,
              filesToUpload,
              selectedFiles.length > 1,
            ),
          });
      const { id, presigned_urls } = uploadResponse;
      const uploadContracts = filesToUpload.map<DatasetUploadContract>((file, index) => {
        const contract = uploadResponse.upload_contracts?.[index];
        if (contract) return contract;
        return {
          original_path: getUploadPath(file),
          object_key: '',
          url: presigned_urls[index],
          method: 'PUT',
          headers: file.type ? { 'Content-Type': file.type } : {},
          content_type: file.type || null,
          expires_seconds: 0,
          upload_mode: 'direct',
        };
      });

      // Upload using the worker pool
      createdDatasetId = id;
      const uploadTotalSize = filesToUpload.reduce((acc, f) => acc + f.size, 0);
      const loadedBytesByFile = new Array(filesToUpload.length).fill(0);
      let lastUpdate = 0;
      let paused = false;
      const uploadController: ChunkedUploadController = {
        pause: () => {
          paused = true;
          setUploadSessionState('paused');
        },
        resume: () => {
          paused = false;
          setUploadSessionState('resumed');
        },
        abort: () => {
          paused = false;
          setUploadSessionState('aborted');
        },
        isPaused: () => paused,
      };
      uploadControllerRef.current = uploadController;

      const updateProgress = (index: number, loaded: number) => {
        loadedBytesByFile[index] = loaded;
        const now = Date.now();
        // Throttle to not overload the whole system
        if (now - lastUpdate > 300 || loaded === uploadTotalSize) {
          const totalLoaded = loadedBytesByFile.reduce((acc, b) => acc + b, 0);
          const percent = Math.round((totalLoaded * 100) / uploadTotalSize);
          setUploadProgress(percent);
          lastUpdate = now;
        }
      };

      const updateChunkProgress = (index: number, file: File, progress: ChunkedUploadProgress) => {
        setUploadedFileName(file.name);
        setCurrentChunk(
          progress.status === 'completed' || progress.status === 'finalizing'
            ? progress.totalChunks
            : progress.chunkIndex,
        );
        setTotalChunks(progress.totalChunks);
        setUploadSessionState(
          uploadController.isPaused() && progress.status === 'uploading'
            ? 'paused'
            : progress.status,
        );
        if (progress.status === 'finalizing') {
          setUploadProgress(100);
          setFinalizationStepIndex(0);
          setUploadState('finalizing');
        }
        updateProgress(index, progress.loadedBytes);
      };

      const uploadDirectFile = async (
        file: File,
        index: number,
        contract: DatasetUploadContract,
      ) => {
        setUploadedFileName(file.name);
        setCurrentChunk(0);
        setTotalChunks(1);
        setUploadSessionState('uploading');
        await DatasetService.uploadFileToPresignedUrl(
          contract.url,
          file,
          (event) => {
            updateProgress(index, event.loaded);
          },
          contract.headers,
        );
        updateProgress(index, file.size);
      };

      const tasks = filesToUpload.map((file, index) => async () => {
        const contract = uploadContracts[index];
        const canUseMultipart =
          Boolean(contract.object_key) &&
          (DatasetService.shouldUseMultipartUpload(file, contract) ||
            restorableMultipartSession?.objectKey === contract.object_key);

        try {
          if (canUseMultipart) {
            usedMultipartUpload = true;
            setHasMultipartControls(true);
            await DatasetService.uploadFileMultipart(id, contract, file, {
              controller: uploadController,
              onFinalizing: () => {
                setUploadProgress(100);
                setFinalizationStepIndex(0);
                setUploadState('finalizing');
              },
              onProgress: (progress) => updateChunkProgress(index, file, progress),
            });
            updateProgress(index, file.size);
            return;
          }

          await uploadDirectFile(file, index, contract);
        } catch (err) {
          console.error(`Failed to upload ${file.name}:`, err);
          throw err;
        }
      });

      await runWithLimit(6, tasks);
      setUploadProgress(100);
      setFinalizationStepIndex(0);
      setUploadState('finalizing');

      if (!usedMultipartUpload) {
        directUploadFinalizationStarted = true;
        await DatasetService.confirmUpload(id);
      }

      setDatasetId(id);
      setUploadSessionState('completed');
      setUploadState('success');
    } catch (err) {
      if (createdDatasetId && !usedMultipartUpload && !directUploadFinalizationStarted) {
        try {
          await DatasetService.deleteDataset(createdDatasetId);
        } catch {
          // The backend may already have cleaned up the failed upload record.
        }
      }
      if (isUploadCanceledError(err)) {
        setUploadState('canceled');
        return;
      }

      const detail = getUploadErrorDetail(err);
      if (isDuplicateDatasetNameError(err, detail)) {
        setErrorMessage(duplicateDatasetNameMessage(formData.name));
        setUploadState('contact');
        return;
      }

      setErrorMessage(
        detail === 'Not authorized to create this dataset'
          ? 'You do not have permission to upload datasets.'
          : (detail ??
              (err instanceof Error
                ? err.message
                : 'An unexpected error occurred during upload. For large folders, check your connection stability and try again.')),
      );
      setUploadState('error');
    } finally {
      uploadControllerRef.current = null;
    }
  };

  const handlePauseUpload = () => {
    uploadControllerRef.current?.pause();
  };

  const handleResumeUpload = () => {
    uploadControllerRef.current?.resume();
  };

  const handleCancelUpload = () => {
    uploadControllerRef.current?.abort();
  };

  return (
    <div className="container">
      <AnimatePresence mode="wait">
        {uploadState === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="max-w-3xl mx-auto mt-10"
          >
            {/* Hero */}
            <div className="text-center mb-10">
              <Badge
                variant="secondary"
                className="mb-4 px-3 py-1 text-xs font-semibold tracking-wide uppercase"
              >
                <Upload size={12} className="mr-1" /> Dataset Contributions
              </Badge>
              <h1 className="heading-1 mb-3">Share Your Dataset</h1>
              <p className="subheading max-w-xl mx-auto">
                Upload your dataset, add Croissant metadata, and send it for expert OpenML review.
              </p>
            </div>
            <FileUploadZone onFilesSelect={handleFilesSelect} />

            {/* Feature strip */}
            <div className="grid grid-cols-3 gap-4 mt-8 text-center">
              {[
                { label: 'Secure Upload', desc: 'Verified before review' },
                { label: 'Open Access', desc: 'Free for everyone' },
                { label: 'Expert Review', desc: 'Reviews by experts ensure quality' },
              ].map((f) => (
                <div key={f.label} className="p-4 rounded-xl bg-card border border-border/60">
                  <p className="font-semibold text-sm text-foreground">{f.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {uploadState === 'contact' && (
          <motion.div
            key="contact"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="max-w-lg mx-auto mt-10"
          >
            <Card className="shadow-lg border-border/70">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Almost there!</CardTitle>
                <CardDescription>
                  Tell us about yourself and your dataset to complete the upload.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* File preview pill */}
                <div className="flex flex-col gap-3 p-3 rounded-xl bg-muted/60 border border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      {hasDirectorySelection ? (
                        <FolderOpen size={16} className="text-primary" />
                      ) : (
                        <Upload size={16} className="text-primary" />
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="font-semibold text-sm truncate">
                        {hasDirectorySelection
                          ? selectedDirectoryRoot
                            ? `Folder "${selectedDirectoryRoot}" selected`
                            : 'Multiple folders selected'
                          : `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} selected`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFiles.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(
                          2,
                        )}{' '}
                        MB total
                        {selectionPackageFeedback ? ` - ${selectionPackageFeedback}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setUploadState('idle')}
                      className="text-xs shrink-0"
                    >
                      Change
                    </Button>
                  </div>

                  {/* Small list of files */}
                  <div className="space-y-1 pl-12 border-l border-border/50 ml-4">
                    {selectedFiles.slice(0, 5).map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <FileText size={10} />
                        <span className="truncate max-w-[240px]">{getUploadPath(file)}</span>
                      </div>
                    ))}
                    {selectedFiles.length > 5 && (
                      <p className="text-[10px] text-muted-foreground/70 italic pl-5">
                        + {selectedFiles.length - 5} more files...
                      </p>
                    )}
                  </div>
                </div>

                {errorMessage && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    <XCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleContactSubmit} className="space-y-4">
                  {/* Dataset details */}
                  <Input
                    label="Dataset Name"
                    placeholder="ImageNet"
                    required
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      setErrorMessage(null);
                    }}
                  />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Give a description of the dataset that you are uploading. Providing any information that may help the expert in processing the dataset is appreciated."
                      required={false}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>

                  {/* Contact details */}
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="First Name"
                      placeholder="John"
                      required
                      showRequiredIndicator={!formData.firstName.trim()}
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                    <Input
                      label="Last Name"
                      placeholder="Porquilious"
                      required
                      showRequiredIndicator={!formData.lastName.trim()}
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                  <Input
                    label="Email Address"
                    type="email"
                    placeholder="john.porquilious@example.com"
                    required
                    showRequiredIndicator={!formData.email.trim()}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />

                  <Button type="submit" className="w-full" size="lg">
                    Upload Dataset <ArrowRight size={16} />
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {(uploadState === 'compressing' ||
          uploadState === 'uploading' ||
          uploadState === 'finalizing' ||
          uploadState === 'success' ||
          uploadState === 'canceled' ||
          uploadState === 'error') && (
          <motion.div
            key={uploadState}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="text-center max-w-lg mx-auto mt-20"
          >
            <Card className="shadow-lg">
              <CardContent className="pt-12 pb-12 flex flex-col items-center">
                {uploadState === 'compressing' ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                      className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6"
                    >
                      <Package size={36} className="text-primary" />
                    </motion.div>
                    <h2 className="heading-2 mb-2">Compressing…</h2>
                    <p className="text-muted-foreground text-sm mb-6">
                      Packing{' '}
                      <span className="font-medium text-foreground">
                        {originalFileCount} file{originalFileCount > 1 ? 's' : ''}
                      </span>{' '}
                      into a single ZIP archive
                    </p>
                    <div className="w-full max-w-xs bg-muted rounded-full h-1.5 overflow-hidden">
                      <motion.div
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${compressionProgress}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>
                    <TipsCarousel />
                  </>
                ) : uploadState === 'uploading' ? (
                  <>
                    <div className="relative mb-8">
                      <div className="w-24 h-24 rounded-full border-4 border-muted flex items-center justify-center">
                        <span
                          className="text-xl font-bold text-primary"
                          data-testid="upload-progress-percent"
                        >
                          {uploadProgress}%
                        </span>
                      </div>
                      <svg
                        className="absolute top-0 left-0 w-24 h-24 -rotate-90 pointer-events-none"
                        viewBox="0 0 100 100"
                      >
                        <circle
                          cx="50"
                          cy="50"
                          r="48"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                          className="text-primary transition-all duration-300 ease-out"
                          strokeDasharray={2 * Math.PI * 48}
                          strokeDashoffset={2 * Math.PI * 48 * (1 - uploadProgress / 100)}
                        />
                      </svg>
                    </div>

                    <h2 className="heading-2 mb-2">
                      {uploadProgress < 100 ? 'Uploading…' : 'Finalizing…'}
                    </h2>
                    <p className="text-muted-foreground text-sm mb-6">
                      {originalFileCount > 1 ? (
                        <>
                          Uploading compressed archive{' '}
                          <span className="font-medium text-foreground">
                            ({originalFileCount} files)
                          </span>
                        </>
                      ) : (
                        <>
                          Uploading{' '}
                          <span className="font-medium text-foreground">
                            {selectedFiles[0]?.name ?? 'file'}
                          </span>
                        </>
                      )}
                    </p>

                    <div className="mb-4 flex flex-col items-center gap-3 text-sm">
                      <div
                        className="rounded-md bg-muted px-3 py-1 text-muted-foreground"
                        data-testid="upload-chunk-status"
                      >
                        Chunk {currentChunk} of {totalChunks}
                      </div>
                      <p
                        className="max-w-xs text-xs text-muted-foreground"
                        data-testid="upload-session-message"
                      >
                        {uploadSessionMessage(
                          uploadSessionState,
                          uploadedFileName,
                          selectedFiles[0]?.name,
                        )}
                      </p>
                      {hasMultipartControls && (
                        <div className="flex gap-2">
                          {uploadSessionState === 'paused' ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleResumeUpload}
                            >
                              <PlayCircle size={16} />
                              Resume Upload
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handlePauseUpload}
                            >
                              <PauseCircle size={16} />
                              Pause Upload
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCancelUpload}
                          >
                            <XCircle size={16} />
                            Cancel Upload
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="w-full max-w-xs bg-muted rounded-full h-1.5 overflow-hidden">
                      <motion.div
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>

                    <TipsCarousel />
                  </>
                ) : uploadState === 'finalizing' ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                      className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6"
                    >
                      <Clock size={36} className="text-primary" />
                    </motion.div>
                    <h2 className="heading-2 mb-2">Finalizing upload…</h2>
                    <p className="text-muted-foreground text-sm mb-6 max-w-xs">
                      Verifying your uploaded files with the server. We are checking each
                      server-side step before showing the completion message.
                    </p>
                    <div
                      className="w-full max-w-xs bg-muted rounded-full h-1.5 overflow-hidden"
                      role="progressbar"
                      aria-label="Finalization progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={finalizationProgress}
                    >
                      <motion.div
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${finalizationProgress}%` }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                    <div className="mt-6 w-full max-w-sm space-y-3 text-left">
                      {FINALIZATION_STEPS.map((step, index) => {
                        const isComplete = index < finalizationStepIndex;
                        const isActive = index === finalizationStepIndex;
                        return (
                          <div
                            key={step}
                            className={`flex items-center gap-3 text-sm ${
                              isActive
                                ? 'text-foreground'
                                : isComplete
                                  ? 'text-primary'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                                isComplete
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : isActive
                                    ? 'border-primary text-primary'
                                    : 'border-border text-muted-foreground'
                              }`}
                            >
                              {isComplete ? <CheckCircle size={14} /> : index + 1}
                            </span>
                            <span className={isActive ? 'font-medium' : ''}>{step}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : uploadState === 'success' ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                      className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-6"
                    >
                      <CheckCircle size={40} className="text-green-600 dark:text-green-400" />
                    </motion.div>
                    <h2 className="heading-2 mb-2">Upload Complete!</h2>
                    <p className="text-muted-foreground text-sm mb-4 max-w-xs">
                      Thank you,{' '}
                      <span className="font-semibold text-foreground">{formData.firstName}</span>.
                      Your submission has been received.
                    </p>

                    {/* Processing status feedback */}
                    <div className="upload-status-badge">
                      <Clock size={13} />
                      <span>Pending Processing</span>
                    </div>

                    <div className="upload-status-notice">
                      <Info size={14} className="shrink-0 mt-0.5" />
                      <span>
                        Enter as much known metadata as possible before expert review, including
                        dataset contents, collection method, creators, license, publication dates,
                        files, and known limitations. Incomplete metadata may delay expert review,
                        but your uploaded dataset is saved. You can finish later from{' '}
                        <button
                          onClick={() => navigate('/datasets')}
                          className="font-bold underline hover:text-primary transition-colors"
                        >
                          My Datasets
                        </button>
                        , or view your{' '}
                        <button
                          onClick={() => navigate(`/datasets/${datasetId}`)}
                          className="font-bold underline hover:text-primary transition-colors"
                        >
                          newly created dataset
                        </button>
                        .
                      </span>
                    </div>

                    <div className="flex gap-3 mt-6">
                      <Button variant="outline" onClick={() => navigate('/datasets')}>
                        Finish Later
                      </Button>
                      <Button onClick={() => navigate('/metadata', { state: { datasetId } })}>
                        Complete Metadata <ArrowRight size={16} />
                      </Button>
                    </div>
                  </motion.div>
                ) : uploadState === 'canceled' ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                      className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6"
                    >
                      <XCircle size={40} className="text-muted-foreground" />
                    </motion.div>
                    <h2 className="heading-2 mb-2">Upload Canceled</h2>
                    <p className="text-muted-foreground text-sm mb-6 max-w-xs">
                      The multipart upload was canceled and saved upload progress was cleaned up.
                    </p>
                    <Button onClick={() => setUploadState('idle')} variant="outline">
                      Start Again
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                      className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-6"
                    >
                      <XCircle size={40} className="text-red-600 dark:text-red-400" />
                    </motion.div>
                    <h2 className="heading-2 mb-2">Upload Failed</h2>
                    <p className="text-muted-foreground text-sm mb-6 max-w-xs">
                      {errorMessage ?? 'There was a problem uploading your file. Please try again.'}
                    </p>
                    <Button onClick={() => setUploadState('idle')} variant="outline">
                      Try Again
                    </Button>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
