import React from 'react';
import { User, ShieldCheck, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Page } from '../App';

interface LoginPageProps {
  onNavigate: (page: Page) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login } = useAuth();

  const handleLogin = (role: 'customer' | 'expert') => {
    login(role);
    onNavigate('datasets'); // Go straight to datasets to see the new dashboard
  };

  return (
    <div
      className="container fade-in"
      style={{
        padding: '4rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '3rem', maxWidth: '500px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--accent-primary)',
            marginBottom: '1.5rem',
          }}
        >
          <LogIn size={32} />
        </div>
        <h1 className="heading-1" style={{ fontSize: '2.5rem' }}>
          Welcome Back
        </h1>
        <p className="subheading">Select your role below to continue.</p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '2rem',
          width: '100%',
          maxWidth: '800px',
        }}
      >
        {/* Customer Login Card */}
        <div
          className="dataset-card"
          onClick={() => handleLogin('customer')}
          style={{
            cursor: 'pointer',
            textAlign: 'center',
            padding: '2.5rem 2rem',
            border: '2px solid transparent',
          }}
          onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
          onMouseOut={(e) => (e.currentTarget.style.borderColor = 'transparent')}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '1.5rem',
              color: 'var(--text-secondary)',
            }}
          >
            <User size={48} />
          </div>
          <h2 className="heading-2" style={{ marginBottom: '0.5rem' }}>
            Customer
          </h2>
          <p className="dataset-description" style={{ marginBottom: '2rem' }}>
            Standard user view. Upload new datasets and check the processing status of your past
            submissions.
          </p>
          <button className="btn btn-primary" style={{ width: '100%' }}>
            Login as Customer
          </button>
        </div>

        {/* Expert Login Card */}
        <div
          className="dataset-card"
          onClick={() => handleLogin('expert')}
          style={{
            cursor: 'pointer',
            textAlign: 'center',
            padding: '2.5rem 2rem',
            border: '2px solid transparent',
          }}
          onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
          onMouseOut={(e) => (e.currentTarget.style.borderColor = 'transparent')}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '1.5rem',
              color: 'var(--accent-primary)',
            }}
          >
            <ShieldCheck size={48} />
          </div>
          <h2 className="heading-2" style={{ marginBottom: '0.5rem' }}>
            Expert
          </h2>
          <p className="dataset-description" style={{ marginBottom: '2rem' }}>
            Admin view. Review datasets submitted by all users, change their processing status, and
            download files.
          </p>
          <button
            className="btn btn-primary"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: 'white',
            }}
          >
            Login as Expert
          </button>
        </div>
      </div>
    </div>
  );
};
