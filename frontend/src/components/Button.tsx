import React, { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  isLoading,
  className,
  disabled,
  ...props
}) => {
  return (
    <button
      className={twMerge(
        clsx('btn', `btn-${variant}`, (isLoading || disabled) && 'btn-disabled', className),
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <span className="btn-spinner"></span> : children}
    </button>
  );
};
