import React from 'react';
import { themeClasses } from '@/utils/themeUtils.util';

export interface FormTextareaProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  rows?: number;
  className?: string;
}

export const FormTextarea = React.memo<FormTextareaProps>(({
  label,
  name,
  value,
  onChange,
  required = false,
  placeholder,
  error,
  disabled = false,
  rows = 4,
  className
}) => {
  return (
    <div className={className}>
      <label htmlFor={name} className={themeClasses.label}>
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <textarea
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={`${themeClasses.textarea} ${error ? 'border-destructive' : ''}`}
      />
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
});
