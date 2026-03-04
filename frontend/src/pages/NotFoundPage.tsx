import React from 'react';
import { FileQuestion } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: '60vh',
        textAlign: 'center',
      }}
    >
      <FileQuestion size={64} color="var(--text-secondary)" style={{ marginBottom: '1.5rem' }} />
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
        Page Not Found
      </h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', marginBottom: '2rem' }}>
        The page you are looking for doesn't exist or has been moved.
      </p>
      <a href="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
        Return Home
      </a>
    </div>
  );
};
