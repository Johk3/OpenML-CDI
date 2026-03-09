import React from 'react';
import { Database } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="container footer-content">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Database size={14} className="text-primary opacity-70" />
          <span>© {new Date().getFullYear()} OpenML CDI. All rights reserved.</span>
        </div>
        <div className="footer-links">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="https://openml.org" target="_blank" rel="noreferrer">
            openml.org ↗
          </a>
        </div>
      </div>
    </footer>
  );
};
