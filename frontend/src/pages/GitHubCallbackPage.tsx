import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { AUTH_ERROR_MESSAGES, loginErrorUrl } from '../lib/authMessages';

export const GitHubCallbackPage: React.FC = () => {
  const { loginWithGithub } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) {
      return;
    }

    hasStarted.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      navigate(loginErrorUrl(AUTH_ERROR_MESSAGES.missingOAuthParams), { replace: true });
      return;
    }

    loginWithGithub(code, state).catch((error: unknown) => {
      const message =
        error instanceof Error && error.message ? error.message : AUTH_ERROR_MESSAGES.generic;
      navigate(loginErrorUrl(message), { replace: true });
    });
  }, [loginWithGithub, navigate, searchParams]);

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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-8 py-10 shadow-sm">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <h1 className="text-xl font-semibold">Signing you in...</h1>
        <p className="text-sm text-muted-foreground">Completing your GitHub authentication.</p>
      </div>
    </motion.div>
  );
};
