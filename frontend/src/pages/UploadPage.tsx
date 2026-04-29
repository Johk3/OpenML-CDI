import React, { useState } from 'react';
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

type UploadState = 'idle' | 'contact' | 'compressing' | 'uploading' | 'success' | 'error';

const TIPS = [
  'Multiple files are automatically compressed into a single ZIP archive before uploading, making the transfer faster and giving you a single file to share with your expert.',
  'If you run into any troubles or have found new ways to describe your dataset, be sure to contact your assigned expert for guidance.',
  'Large datasets? Using a stable wired connection can prevent upload interruptions.',
  'Please do not close the site! Otherwise your upload will be interrupted.',
  'Remember to fill in the Croissant Metadata to the best of your ability, this will help the expert greatly!',
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

  // Prevention of accidental page closure during compression or upload
  React.useEffect(() => {
    if (uploadState === 'compressing' || uploadState === 'uploading') {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = '';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [uploadState]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    firstName: '',
    lastName: '',
    email: '',
  });

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
    setSelectedFiles(files);
    setUploadState('contact');
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0 || !user) return;

    setErrorMessage(null);
    setUploadProgress(0);
    setCompressionProgress(0);
    setOriginalFileCount(selectedFiles.length);

    try {
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

      const { id, presigned_urls } = await DatasetService.requestUploadUrl({
        name: formData.name,
        description: {
          text: formData.description,
          contact: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            email: formData.email,
          },
        },
        filenames: filesToUpload.map((f) => f.webkitRelativePath || f.name),
        content_types: filesToUpload.map((f) => f.type || undefined),
      });

      // Upload using the worker pool
      const uploadTotalSize = filesToUpload.reduce((acc, f) => acc + f.size, 0);
      const loadedBytesByFile = new Array(filesToUpload.length).fill(0);
      let lastUpdate = 0;

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

      const tasks = filesToUpload.map((file, index) => async () => {
        try {
          await DatasetService.uploadFileToPresignedUrl(presigned_urls[index], file, (event) =>
            updateProgress(index, event.loaded),
          );
          updateProgress(index, file.size);
        } catch (err) {
          console.error(`Failed to upload ${file.name}:`, err);
          throw err;
        }
      });

      await runWithLimit(6, tasks);
      setUploadProgress(100);

      // Confirm upload
      await DatasetService.confirmUpload(id);

      setDatasetId(id);
      setUploadState('success');
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail?: string }>;
      const detail = axiosErr.response?.data?.detail;
      setErrorMessage(
        detail === 'Not authorized to create this dataset'
          ? 'You do not have permission to upload datasets.'
          : (detail ??
              'An unexpected error occurred during upload. For large folders, check your connection stability and try again.'),
      );
      setUploadState('error');
    }
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
                Contribute to the OpenML community. Every dataset you share helps experts build
                better models.
              </p>
            </div>
            <FileUploadZone onFilesSelect={handleFilesSelect} />

            {/* Feature strip */}
            <div className="grid grid-cols-3 gap-4 mt-8 text-center">
              {[
                { label: 'Secure Upload', desc: 'End-to-end encrypted' },
                { label: 'Open Access', desc: 'Free for experts' },
                { label: 'Expert Review', desc: 'Quality guaranteed' },
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
                      <Upload size={16} className="text-primary" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="font-semibold text-sm truncate">
                        {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFiles.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(
                          2,
                        )}{' '}
                        MB total
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
                        <span className="truncate max-w-[200px]">
                          {file.webkitRelativePath || file.name}
                        </span>
                      </div>
                    ))}
                    {selectedFiles.length > 5 && (
                      <p className="text-[10px] text-muted-foreground/70 italic pl-5">
                        + {selectedFiles.length - 5} more files...
                      </p>
                    )}
                  </div>
                </div>

                <form onSubmit={handleContactSubmit} className="space-y-4">
                  {/* Dataset details */}
                  <Input
                    label="Dataset Name"
                    placeholder="ImageNet"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                    <Input
                      label="Last Name"
                      placeholder="Porquilious"
                      required
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                  <Input
                    label="Email Address"
                    type="email"
                    placeholder="john.porquilious@example.com"
                    required
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
          uploadState === 'success' ||
          uploadState === 'error') && (
          <motion.div
            key={uploadState}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="text-center max-w-md mx-auto mt-20"
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
                        <span className="text-xl font-bold text-primary">{uploadProgress}%</span>
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
                        Processing timeline varies by submission. You can influence the speediness
                        of the processing of your dataset by giving us a detailed description of
                        your dataset metadata. Your dataset status will update once processing
                        begins. You can track progress on{' '}
                        <button
                          onClick={() => navigate('/datasets')}
                          className="font-bold underline hover:text-primary transition-colors"
                        >
                          My Datasets
                        </button>{' '}
                        or view your{' '}
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
                        View My Datasets
                      </Button>
                      <Button onClick={() => navigate('/metadata', { state: { datasetId } })}>
                        Configure Metadata <ArrowRight size={16} />
                      </Button>
                    </div>
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
