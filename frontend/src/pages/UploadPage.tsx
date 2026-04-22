import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileUploadZone } from '../components/FileUploadZone';
import { Input } from '../components/Input';
import { CheckCircle, FileText, ArrowRight, Upload, Info, Clock, XCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUserContext } from '@/hooks/useUserContext';
import { DatasetService } from '@/services/datasetService';
import { AxiosError } from 'axios';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type UploadState = 'idle' | 'contact' | 'uploading' | 'success' | 'error';

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUserContext();
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    firstName: '',
    lastName: '',
    email: '',
  });

  const handleFileSelect = (file: File) => {
    if (!user) {
      navigate('/login', { state: { from: location } });
      return;
    }
    setSelectedFile(file);
    setUploadState('contact');
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !user) return;

    setUploadState('uploading');
    setErrorMessage(null);

    try {
      // Firstly: Register the dataset and get a pre-signed PUT URL
      const { id, presigned_url } = await DatasetService.requestUploadUrl({
        name: formData.name,
        description: {
          text: formData.description,
          contact: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            email: formData.email,
          },
        },
        filename: selectedFile.name,
        content_type: selectedFile.type || undefined,
      });

      // Secondly: Upload the file directly to storage
      await DatasetService.uploadFileToPresignedUrl(presigned_url, selectedFile, (event) => {
        if (event.total) {
          const percent = Math.round((event.loaded * 100) / event.total);
          setUploadProgress(percent);
        }
      });
      setUploadProgress(100);

      // Thirdly: Tell the backend the upload is done
      await DatasetService.confirmUpload(id);

      setDatasetId(id);
      setUploadState('success');
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail?: string }>;
      const detail = axiosErr.response?.data?.detail;
      setErrorMessage(
        detail === 'Not authorized to create this dataset'
          ? 'You do not have permission to upload datasets.'
          : (detail ?? 'An unexpected error occurred. Please try again.'),
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
                Contribute to the OpenML community. Every dataset you share helps researchers build
                better models.
              </p>
            </div>
            <FileUploadZone onFileSelect={handleFileSelect} />

            {/* Feature strip */}
            <div className="grid grid-cols-3 gap-4 mt-8 text-center">
              {[
                { label: 'Secure Upload', desc: 'End-to-end encrypted' },
                { label: 'Open Access', desc: 'Free for researchers' },
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
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/60 border border-border/50">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="font-semibold text-sm truncate">{selectedFile?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile?.size ? selectedFile.size / 1024 / 1024 : 0).toFixed(2)} MB
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
                    <Label htmlFor="description">
                      Description
                      <span className="text-destructive ml-1">*</span>
                    </Label>
                    <Textarea
                      id="description"
                      placeholder="Give a description of the dataset that you are uploading. Providing any information that may help the expert in processing the dataset is appreciated."
                      required
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

        {(uploadState === 'uploading' || uploadState === 'success' || uploadState === 'error') && (
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
                {uploadState === 'uploading' ? (
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
                      Uploading{' '}
                      <span className="font-medium text-foreground">{selectedFile?.name}</span>
                    </p>

                    <div className="w-full max-w-xs bg-muted rounded-full h-1.5 overflow-hidden">
                      <motion.div
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.1 }}
                      />
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
