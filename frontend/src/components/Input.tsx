import React, { InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className, id, ...props }) => {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="input-group">
      <label htmlFor={inputId} className="input-label">
        {label}
        {props.required && <span className="text-error ml-1">*</span>}
      </label>
      <input
        id={inputId}
        className={twMerge(clsx('base-input', error ? 'input-error' : '', className))}
        {...props}
      />
      {error && <p className="input-error-text">{error}</p>}
    </div>
  );
};
