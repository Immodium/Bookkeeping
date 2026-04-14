// Form handling and validation types

// Form and validation types
export type ValidationRule<T> = (value: T) => string | undefined;
export type ValidationRules<T> = {
  [K in keyof T]?: ValidationRule<T[K]>[];
};

export type FieldError = {
  message: string;
  type: string;
};

export type FieldErrors<T> = {
  [K in keyof T]?: FieldError;
};

// React form event types
export type ClickEvent = React.MouseEvent<HTMLElement>;
export type ChangeEvent<T = HTMLInputElement> = React.ChangeEvent<T>;
export type FormEvent = React.FormEvent<HTMLFormElement>;
export type KeyboardEvent = React.KeyboardEvent<HTMLElement>;

// Form state management
export interface FormState<T> {
  values: T;
  errors: FieldErrors<T>;
  touched: Record<keyof T, boolean>;
  isValid: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
}

// Form field props
export interface FormFieldProps<T = unknown> {
  name: string;
  value: T;
  error?: FieldError;
  onChange: (value: T) => void;
  onBlur?: () => void;
  disabled?: boolean;
  required?: boolean;
}