import React from 'react';
import { Database, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleAuthAction = (e: React.MouseEvent) => {
    e.preventDefault();
    if (user) {
      logout();
      navigate('/');
    } else {
      navigate('/login');
    }
  };

  return (
    <header className="header">
      <div className="container header-content">
        <div className="logo-section" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          <div className="logo-icon">
            <Database size={24} color="var(--bg-secondary)" />
          </div>
          <span className="logo-text">OpenML CDI</span>
        </div>
        <nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <NavLink
              to="/"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              end
            >
              Upload
            </NavLink>
            {user && (
              <NavLink
                to="/datasets"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                My Datasets
              </NavLink>
            )}
            <NavLink
              to="/about"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              About
            </NavLink>
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
