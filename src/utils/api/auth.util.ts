const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;

  // Check localStorage first (for "remember me" tokens)
  const localToken = localStorage.getItem(TOKEN_KEY);
  const sessionToken = sessionStorage.getItem(TOKEN_KEY);

  if (localToken) return localToken;

  // Fall back to sessionStorage (for session-only tokens)
  return sessionToken;
};

export const setToken = (token: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
};

export const removeToken = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
};

export const getRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  // Check localStorage first (for "remember me" tokens)
  const localToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (localToken) return localToken;

  // Fall back to sessionStorage (for session-only tokens)
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
};

export const setRefreshToken = (token: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
};

export const removeRefreshToken = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

export const clearAuthTokens = (): void => {
  removeToken();
  removeRefreshToken();
};

export const isTokenExpired = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Date.now() / 1000;
    return payload.exp < currentTime;
  } catch {
    return true;
  }
};

export const getTokenPayload = (token: string): any => {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
};

export const isAuthenticated = (): boolean => {
  const token = getToken();
  return token !== null && !isTokenExpired(token);
};

export class AuthUtils {
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static validatePassword(password: string, requirements: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < (requirements.min_length || 8)) {
      errors.push(`Password must be at least ${requirements.min_length || 8} characters long`);
    }

    if (requirements.require_uppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (requirements.require_lowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (requirements.require_numbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (requirements.require_special_chars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static calculatePasswordStrength(password: string): { score: number; level: string; feedback: string[] } {
    let score = 0;
    const feedback: string[] = [];

    if (!password) {
      return { score: 0, level: 'weak', feedback: ['Enter a password'] };
    }

    // Length scoring
    if (password.length >= 8) score += 25;
    else feedback.push('Use at least 8 characters');

    if (password.length >= 12) score += 10;
    if (password.length >= 16) score += 5;

    // Character variety
    if (/[a-z]/.test(password)) score += 15;
    else feedback.push('Add lowercase letters');

    if (/[A-Z]/.test(password)) score += 15;
    else feedback.push('Add uppercase letters');

    if (/\d/.test(password)) score += 15;
    else feedback.push('Add numbers');

    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 20;
    else feedback.push('Add special characters');

    // Patterns and repetition
    if (!/(.)\1{2,}/.test(password)) score += 10;
    else feedback.push('Avoid repeating characters');

    // Determine level
    let level: string;
    if (score < 30) level = 'weak';
    else if (score < 60) level = 'fair';
    else if (score < 90) level = 'good';
    else level = 'strong';

    return { score, level, feedback };
  }

  static verifyPasswordResetToken(token: string): { email: string } | null {
    try {
      // Decode the JWT token
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = JSON.parse(atob(parts[1]));

      // Check if token has expired
      const currentTime = Date.now() / 1000;
      if (payload.exp && payload.exp < currentTime) {
        return null;
      }

      // Check if it's a password reset token
      if (payload.type !== 'password_reset') {
        return null;
      }

      // Return the email from the token payload
      return { email: payload.email };
    } catch (error) {
      return null;
    }
  }

  static async hashPassword(password: string): Promise<string> {
    // Use Web Crypto API for hashing
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}