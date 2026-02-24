import React, { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { Page } from '../App';

interface MainLayoutProps {
  children: ReactNode;
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, currentPage, onNavigate }) => {
  return (
    <div className="layout-wrapper">
      <Header currentPage={currentPage} onNavigate={onNavigate} />
      <main className="main-content">{children}</main>
      <Footer />
    </div>
  );
};
