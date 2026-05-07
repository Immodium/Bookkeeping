const PHONE_DIGIT_LIMIT = 10;

const toDigitsOnly = (value: string): string => value.replace(/\D/g, '').slice(0, PHONE_DIGIT_LIMIT);

export const formatPhoneNumber = (value: string): string => {
  const digits = toDigitsOnly(value);
  if (!digits) return '';

  if (digits.length <= 3) {
    return `(${digits}`;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

export const formatUsPhoneNumber = formatPhoneNumber;
