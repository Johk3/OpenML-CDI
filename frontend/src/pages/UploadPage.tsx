import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileUploadZone } from '../components/FileUploadZone';
import { Input } from '../components/Input';
import { CheckCircle, FileText, ArrowRight, Upload, XCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type UploadState = 'idle' | 'contact' | 'uploading' | 'success' | 'error';

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [contactDetails, setContactDetails] = useState({
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

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUploadState('uploading');

    // Simulate upload process
    setTimeout(() => {
      if (selectedFile?.name.includes('fail')) {
        setUploadState('error');
      } else {
        setUploadState('success');
        setTimeout(() => {
          navigate('/metadata');
        }, 2000);
      }
    }, 2000);
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
                  Provide your contact details to complete the upload.
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
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="First Name"
                      required
                      value={contactDetails.firstName}
                      onChange={(e) =>
                        setContactDetails({ ...contactDetails, firstName: e.target.value })
                      }
                    />
                    <Input
                      label="Last Name"
                      required
                      value={contactDetails.lastName}
                      onChange={(e) =>
                        setContactDetails({ ...contactDetails, lastName: e.target.value })
                      }
                    />
                  </div>
                  <Input
                    label="Email Address"
                    type="email"
                    required
                    value={contactDetails.email}
                    onChange={(e) =>
                      setContactDetails({ ...contactDetails, email: e.target.value })
                    }
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
                    <div className="w-16 h-16 rounded-full border-4 border-muted border-t-primary animate-spin mb-6" />
                    <h2 className="heading-2 mb-2">Uploading…</h2>
                    <p className="text-muted-foreground text-sm">
                      Processing{' '}
                      <span className="font-medium text-foreground">{selectedFile?.name}</span>
                    </p>
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
                    <p className="text-muted-foreground text-sm mb-6 max-w-xs">
                      Thank you,{' '}
                      <span className="font-semibold text-foreground">
                        {contactDetails.firstName}
                      </span>
                      . Preparing the metadata form...
                    </p>
                    <div className="w-6 h-6 rounded-full border-2 border-muted border-t-primary animate-spin" />
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
                      There was a problem uploading your file. Please try again.
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
