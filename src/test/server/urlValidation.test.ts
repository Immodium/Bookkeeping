import { describe, expect, it } from 'vitest';
import { validateExternalUrl, validatePdfSourceUrl } from '../../../server/utils/urlValidation.js';

describe('urlValidation SSRF guardrails', () => {
  it('blocks localhost and metadata hosts', () => {
    expect(() => validateExternalUrl('http://localhost/admin')).toThrow(/private|reserved/i);
    expect(() => validateExternalUrl('http://169.254.169.254/latest/meta-data')).toThrow(/private|reserved/i);
  });

  it('allows public https URLs', () => {
    expect(() => validateExternalUrl('https://example.com/hook')).not.toThrow();
  });

  it('restricts PDF URLs to the configured app origin', () => {
    expect(() => validatePdfSourceUrl('http://localhost:8080/reports', 'http://localhost:8080')).not.toThrow();
    expect(() => validatePdfSourceUrl('http://127.0.0.1:8080/reports', 'http://localhost:8080')).toThrow(/origin/i);
    expect(() => validatePdfSourceUrl('https://evil.example/phish', 'http://localhost:8080')).toThrow();
  });
});
