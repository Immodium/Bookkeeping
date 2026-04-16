import React from 'react';
import { themeClasses } from '@/utils/themeUtils.util';

export interface FormInputProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel' | 'number' | 'date';
  required?: boolean;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export const FormInput = React.memo<FormInputProps>(({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
  error,
  disabled = false,
  className
}) => {
  return (
    <div className={className}>
      <label htmlFor={name} className={themeClasses.label}>
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        className={`${themeClasses.input} ${error ? 'border-destructive' : ''}`}
      />
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
});
