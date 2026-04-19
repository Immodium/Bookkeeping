import React from 'react';
import { themeClasses } from '@/utils/themeUtils.util';

export interface FormSelectOption {
  value: string;
  label: string;
}

export interface FormSelectProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: FormSelectOption[];
  required?: boolean;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export const FormSelect = React.memo<FormSelectProps>(({
  label,
  name,
  value,
  onChange,
  options,
  required = false,
  error,
  disabled = false,
  className
}) => {
  return (
    <div className={className}>
      <label htmlFor={name} className={themeClasses.label}>
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        className={`${themeClasses.select} ${error ? 'border-destructive' : ''}`}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
});
