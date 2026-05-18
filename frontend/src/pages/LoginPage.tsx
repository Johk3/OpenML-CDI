import React from 'react';
import { motion } from 'motion/react';
import { Github, LogIn } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { getAuthNoticeMessage, sanitizeAuthErrorMessage } from '../lib/authMessages';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export const LoginPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const error = sanitizeAuthErrorMessage(searchParams.get('error'));
  const notice = getAuthNoticeMessage(searchParams.get('notice'));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="container"
      style={{
        padding: '5rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Hero */}
      <div className="text-center mb-12 max-w-lg">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
          style={{ background: 'var(--accent-gradient)', boxShadow: 'var(--shadow-glow)' }}
        >
          <LogIn size={28} color="white" />
        </div>
        <h1 className="heading-1 mb-3">Welcome to OpenML CDI</h1>
        <p className="subheading">Sign in with GitHub to continue to the platform.</p>
      </div>

      {error ? (
        <div className="w-full max-w-md mb-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="w-full max-w-md mb-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
          {notice}
        </div>
      ) : null}

      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center pb-3">
          <CardTitle className="text-xl">Login to your account</CardTitle>
          <CardDescription>
            Your session stays active with a short-lived access token and a refresh cookie managed
            by the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <GitHubLoginButton />
        </CardContent>
      </Card>
    </motion.div>
  );
};

const GitHubLoginButton: React.FC = () => (
  <motion.div
    whileHover={{ y: -2 }}
    whileTap={{ y: 0 }}
    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
  >
    <Button
      asChild
      size="lg"
      className="w-full gap-3 font-semibold"
      style={{
        background: 'var(--accent-gradient)',
        boxShadow: 'var(--shadow-glow)',
        color: 'white',
        border: 'none',
      }}
    >
      <a href={`${API_BASE_URL}/api/auth/github/login`}>
        <Github size={20} />
        Continue with GitHub
      </a>
    </Button>
  </motion.div>
);
