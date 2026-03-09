import React from 'react';
import { FileQuestion } from 'lucide-react';
import { Button } from '../components/ui/button';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <FileQuestion size={64} className="text-muted-foreground mb-6" />
      <h1 className="text-3xl font-bold mb-3">Page Not Found</h1>
      <p className="text-muted-foreground max-w-md mb-8">
        The page you are looking for doesn't exist or has been moved.
      </p>
      <Button asChild>
        <a href="/">Return Home</a>
      </Button>
    </div>
  );
};
