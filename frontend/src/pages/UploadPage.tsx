import React, { useState } from 'react';
import { FileUploadZone } from '../components/FileUploadZone';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { CheckCircle, FileText, ArrowRight } from 'lucide-react';

type UploadState = 'idle' | 'contact' | 'uploading' | 'success';

export const UploadPage: React.FC = () => {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [contactDetails, setContactDetails] = useState({
    firstName: '',
    lastName: '',
    email: '',
  });

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setUploadState('contact');
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUploadState('uploading');

    // Simulate upload delay
    setTimeout(() => {
      setUploadState('success');
    }, 2000);
  };

  const resetFlow = () => {
    setSelectedFile(null);
    setContactDetails({ firstName: '', lastName: '', email: '' });
    setUploadState('idle');
  };

  return (
    <div className="container">
      {uploadState === 'idle' && (
        <div className="animate-fade-in text-center max-w-3xl mx-auto mt-10">
          <h1 className="heading-1">Share Your Dataset</h1>
          <p className="subheading mb-10">
            Contribute to the global machine learning community by uploading your dataset.
          </p>
          <FileUploadZone onFileSelect={handleFileSelect} />
        </div>
      )}

      {uploadState === 'contact' && (
        <div className="animate-fade-in max-w-xl mx-auto mt-10">
          <div className="glass-panel p-8 rounded-2xl relative overflow-hidden">
            <h2 className="heading-2">You're almost there!</h2>
            <p className="subheading mb-6">
              Please provide your contact details to complete the upload.
            </p>

            <div className="flex items-center gap-3 mb-6 p-4 bg-[var(--bg-tertiary)] rounded-lg">
              <FileText className="text-[var(--accent-primary)]" />
              <div className="flex-1 overflow-hidden">
                <p className="font-medium text-sm text-[var(--text-primary)] truncate">
                  {selectedFile?.name}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {(selectedFile?.size ? selectedFile.size / 1024 / 1024 : 0).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={() => setUploadState('idle')}
                className="text-xs text-[var(--accent-primary)] hover:underline"
              >
                Change
              </button>
            </div>

            <form onSubmit={handleContactSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="First Name"
                  required
                  value={contactDetails.firstName}
                  onChange={(e) =>
                    setContactDetails({
                      ...contactDetails,
                      firstName: e.target.value,
                    })
                  }
                />
                <Input
                  label="Last Name"
                  required
                  value={contactDetails.lastName}
                  onChange={(e) =>
                    setContactDetails({
                      ...contactDetails,
                      lastName: e.target.value,
                    })
                  }
                />
              </div>
              <Input
                label="Email Address"
                type="email"
                required
                value={contactDetails.email}
                onChange={(e) =>
                  setContactDetails({
                    ...contactDetails,
                    email: e.target.value,
                  })
                }
              />
              <Button type="submit" className="mt-4 w-full">
                Continue <ArrowRight size={18} />
              </Button>
            </form>
          </div>
        </div>
      )}

      {(uploadState === 'uploading' || uploadState === 'success') && (
        <div className="animate-fade-in text-center max-w-xl mx-auto mt-20">
          <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-[var(--bg-secondary)] rounded-2xl shadow-lg border border-[var(--border-color)]">
            {uploadState === 'uploading' ? (
              <>
                <div className="w-16 h-16 border-4 border-t-[var(--accent-primary)] border-[var(--bg-tertiary)] rounded-full animate-spin mb-6"></div>
                <h2 className="heading-2">Uploading Dataset...</h2>
                <p className="text-[var(--text-secondary)] mt-2">
                  Please wait while we process {selectedFile?.name}
                </p>
              </>
            ) : (
              <div className="animate-fade-in-delayed flex flex-col items-center">
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle size={40} className="text-[var(--success)]" />
                </div>
                <h2 className="heading-2">Upload Complete!</h2>
                <p className="text-[var(--text-secondary)] mt-2 mb-8">
                  Thank you for contributing, {contactDetails.firstName}. Your dataset has been
                  successfully uploaded and is pending review.
                </p>
                <Button variant="outline" onClick={resetFlow}>
                  Upload Another Dataset
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
