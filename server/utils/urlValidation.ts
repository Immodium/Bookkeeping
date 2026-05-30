/**
 * SSRF guardrails for server-side HTTP fetches (webhooks, PDF generation, etc.)
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '169.254.169.254',
  'metadata.google.internal',
]);

const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1$|fd[0-9a-f]{2}:)/i;

/**
 * Reject URLs that could target internal networks or cloud metadata endpoints.
 */
export function validateExternalUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must use http or https');
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || PRIVATE_IP_RE.test(host)) {
    throw new Error('URL points to a private or reserved address');
  }
}

/**
 * Restrict PDF page rendering to same-origin app URLs (prevents SSRF via Puppeteer).
 * Allows localhost when it matches the configured app origin (typical in development).
 */
export function validatePdfSourceUrl(rawUrl: string, allowedOrigin: string): void {
  let parsed: URL;
  let allowed: URL;
  try {
    parsed = new URL(rawUrl);
    allowed = new URL(allowedOrigin);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must use http or https');
  }

  if (parsed.protocol !== allowed.protocol || parsed.host !== allowed.host) {
    throw new Error('PDF source URL must match the application origin');
  }
}
