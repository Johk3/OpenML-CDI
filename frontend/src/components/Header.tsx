import React from 'react';
import { Database, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { Page } from '../App';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentPage, onNavigate }) => {
  const { user, logout } = useAuth();

  const handleAuthAction = (e: React.MouseEvent) => {
    e.preventDefault();
    if (user) {
      logout();
      if (currentPage === 'datasets') onNavigate('upload');
    } else {
      onNavigate('login');
    }
  };

  return (
    <header className="header">
      <div className="container header-content">
        <div
          className="logo-section"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('upload')}
        >
          <div className="logo-icon">
            <Database size={24} color="var(--bg-secondary)" />
          </div>
          <span className="logo-text">OpenML CDI</span>
        </div>
        <nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <a
              href="#"
              className={`nav-link ${currentPage === 'upload' ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                onNavigate('upload');
              }}
            >
              Upload
            </a>
            {user && (
              <a
                href="#"
                className={`nav-link ${currentPage === 'datasets' ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('datasets');
                }}
              >
                My Datasets
              </a>
            )}
            <a href="#" className="nav-link">
              About
            </a>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              borderLeft: '1px solid var(--border-color)',
              paddingLeft: '1.5rem',
            }}
          >
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span
                  style={{
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <UserIcon size={16} />
                  {user.name} ({user.role})
                </span>
                <button
                  onClick={handleAuthAction}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  <LogOut size={16} /> Logout
                </button>
              </div>
            ) : (
              <button
                onClick={handleAuthAction}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                <LogIn size={16} /> Login
              </button>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};
