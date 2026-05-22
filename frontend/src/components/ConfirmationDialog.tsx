import * as React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ConfirmationTone = 'default' | 'destructive';

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmationTone;
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const toneClasses: Record<
  ConfirmationTone,
  { icon: string; confirmVariant: 'default' | 'destructive' }
> = {
  default: {
    icon: 'border-primary/30 bg-primary/10 text-primary',
    confirmVariant: 'default',
  },
  destructive: {
    icon: 'border-destructive/30 bg-destructive/10 text-destructive',
    confirmVariant: 'destructive',
  },
};

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  isConfirming = false,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const classes = toneClasses[tone];

  React.useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isConfirming) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConfirming, onCancel, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isConfirming}
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <div className={cn('rounded-full border p-2', classes.icon)}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h2 id={titleId} className="text-lg font-semibold leading-none">
              {title}
            </h2>
            <p id={descriptionId} className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={isConfirming} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={classes.confirmVariant}
            disabled={isConfirming}
            onClick={onConfirm}
          >
            {isConfirming ? <Loader2 role="status" className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
