import React, { InputHTMLAttributes } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Label } from './ui/label';
import { Input as ShadcnInput } from './ui/input';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  showRequiredIndicator?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className,
  id,
  showRequiredIndicator,
  ...props
}) => {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');
  const shouldShowRequiredIndicator = showRequiredIndicator ?? props.required;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>
        {label}
        {shouldShowRequiredIndicator && <span className="text-destructive ml-1">*</span>}
      </Label>
      <ShadcnInput
        id={inputId}
        className={cn(error && 'border-destructive focus-visible:ring-destructive/20', className)}
        aria-invalid={!!error}
        {...props}
      />
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="text-destructive text-xs"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};
