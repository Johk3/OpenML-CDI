import { useAuth } from '@/hooks/useAuth';
import { useUserContext } from '@/hooks/useUserContext';
import { UserService } from '@/services/userService';
import { useMutation } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { AlertTriangle, Loader2, ShieldAlert, Trash2, UserRoundCog } from 'lucide-react';
import { motion } from 'motion/react';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserRole } from '@/types/auth';

const DELETE_ERROR_MESSAGE = 'Unable to delete account. Please try again.';
const ROLE_LABELS: Record<UserRole, string> = {
  expert: 'Expert',
  user: 'User',
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    const detail = (error.response?.data as { detail?: string } | undefined)?.detail;
    return detail ?? error.message ?? fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}

export const AccountPage: React.FC = () => {
  const { user, isLoading } = useUserContext();
  const { logout } = useAuth();
  const [deleteFeedback, setDeleteFeedback] = useState<string | null>(null);

  const deleteAccountMutation = useMutation({
    mutationFn: UserService.deleteAccount,
    onSuccess: () => {
      logout();
    },
    onError: (error: unknown) => {
      setDeleteFeedback(getErrorMessage(error, DELETE_ERROR_MESSAGE));
    },
  });

  const handleDeleteAccount = () => {
    setDeleteFeedback(null);
    const shouldDelete = window.confirm(
      'Delete account permanently? This action cannot be undone.',
    );
    if (!shouldDelete) {
      return;
    }
    deleteAccountMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="container py-20 flex justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading account...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container py-20">
        <div className="max-w-xl rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Unable to load your account profile.
        </div>
      </div>
    );
  }

  const isDeleting = deleteAccountMutation.isPending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="container py-10 space-y-6"
    >
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <UserRoundCog className="h-3.5 w-3.5" />
          Account settings
        </div>
        <h1 className="heading-1">Manage your account</h1>
        <p className="subheading max-w-2xl">
          Review your profile details and manage account deletion.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
          <CardDescription>
            Current account metadata from your authenticated profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <ReadOnlyField label="Username" value={user.username} />
          <ReadOnlyField label="Role" value={ROLE_LABELS[user.role]} />
          <ReadOnlyField label="Name" value={[user.first_name, user.last_name].join(' ').trim()} />
          <ReadOnlyField label="Email" value={user.email} />
        </CardContent>
      </Card>

      <Card className="border-destructive/35">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Delete account
          </CardTitle>
          <CardDescription>
            Permanently delete your account and end your current session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This action is irreversible and removes your account immediately.
          </div>

          {deleteFeedback ? <InlineFeedback message={deleteFeedback} /> : null}

          <Button
            type="button"
            variant="destructive"
            className="gap-2"
            disabled={isDeleting}
            onClick={handleDeleteAccount}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete account
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const ReadOnlyField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-border/70 bg-background/50 px-3 py-2">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 text-sm font-medium">{value || '-'}</p>
  </div>
);

const InlineFeedback: React.FC<{ message: string }> = ({ message }) => (
  <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
    {message}
  </div>
);
