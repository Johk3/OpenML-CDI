import React from 'react';
import { Database, LogIn, LogOut, User as UserIcon, Sun, Moon } from 'lucide-react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';

// Simple theme toggle using localStorage + .dark class without a full context
function useDarkMode() {
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };
  return { dark, toggle };
}

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { dark, toggle } = useDarkMode();

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
        {/* Logo */}
        <div className="logo-section" onClick={() => navigate('/')}>
          <div className="logo-icon">
            <Database size={20} color="white" />
          </div>
          <span className="logo-text">OpenML CDI</span>
        </div>

        {/* Nav + actions */}
        <nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ display: 'flex', gap: '1.75rem' }}>
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
            className="flex items-center gap-2"
            style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '1.25rem' }}
          >
            {/* Dark mode toggle */}
            <Button variant="ghost" size="icon" onClick={toggle} title="Toggle theme">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </Button>

            {user ? (
              <>
                <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                  <UserIcon size={14} className="text-primary" />
                  {user.name}
                  <span className="text-muted-foreground/60">·</span>
                  <span className="capitalize text-primary/80">{user.role}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={handleAuthAction} className="gap-1.5">
                  <LogOut size={14} /> Logout
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={handleAuthAction} className="gap-1.5">
                <LogIn size={14} /> Login
              </Button>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};
