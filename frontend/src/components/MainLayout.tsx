import React from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { Outlet } from 'react-router-dom';

export const MainLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div className="layout-wrapper">
      <Header />
      <main className="main-content">{children || <Outlet />}</main>
      <Footer />
    </div>
  );
};
