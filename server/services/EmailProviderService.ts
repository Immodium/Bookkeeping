import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';

const FROM_DOMAIN = 'slimbooks.io';

// The Slimbooks logo is embedded inline (via a CID attachment) rather than
// referenced by URL, so it renders in email clients (e.g. Gmail) without
// needing a publicly reachable APP_URL. EmailTemplateService references it as
// `cid:slimbooks-logo` in the header; we attach the file only when that
// reference is present in the HTML.
export const SLIMBOOKS_LOGO_CID = 'slimbooks-logo';

const LOGO_CANDIDATE_PATHS = [
  path.resolve(process.cwd(), 'public/slimbooks-email-logo.png'),
  path.resolve(process.cwd(), 'dist/slimbooks-email-logo.png')
];

let cachedLogoBase64: string | null | undefined;

const getSlimbooksLogoBase64 = (): string | null => {
  if (cachedLogoBase64 !== undefined) {
    return cachedLogoBase64;
  }
  for (const candidate of LOGO_CANDIDATE_PATHS) {
    try {
      cachedLogoBase64 = fs.readFileSync(candidate).toString('base64');
      return cachedLogoBase64;
    } catch {
      // try next candidate
    }
  }
  cachedLogoBase64 = null;
  return cachedLogoBase64;
};

// Cap how long we wait on the email provider so a hung/slow request cannot
// block the caller (and any request awaiting it) indefinitely.
const EMAIL_SEND_TIMEOUT_MS = 15_000;

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

export interface EmailSendResult {
  success: boolean;
  message: string;
}

export interface EmailMessageInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  fromName?: string; // Optional display name, e.g. "Acme Corp via Slimbooks"
  tenantId?: number;
}

export class EmailProviderService {
  private static instance: EmailProviderService;

  static getInstance(): EmailProviderService {
    if (!EmailProviderService.instance) {
      EmailProviderService.instance = new EmailProviderService();
    }
    return EmailProviderService.instance;
  }

  async sendEmail(input: EmailMessageInput): Promise<EmailSendResult> {
    if (!input.to || !input.subject) {
      return { success: false, message: 'Recipient and subject are required' };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { success: false, message: 'Resend API key is not configured' };
    }

    try {
      const resend = new Resend(apiKey);
      const rawTenantId = Number(input.tenantId);
      const tenantId = Number.isInteger(rawTenantId) && rawTenantId > 0 ? rawTenantId : 1;
      const fromAddress = `mail${tenantId}@${FROM_DOMAIN}`;
      const from = input.fromName ? `${input.fromName} <${fromAddress}>` : fromAddress;
      const html = input.html || input.text || '';

      // Attach the Slimbooks logo inline when the HTML references it via cid.
      const attachments: Array<{ filename: string; content: string; contentId: string; contentType: string }> = [];
      if (html.includes(`cid:${SLIMBOOKS_LOGO_CID}`)) {
        const logoBase64 = getSlimbooksLogoBase64();
        if (logoBase64) {
          attachments.push({
            filename: 'slimbooks-logo.png',
            content: logoBase64,
            contentId: SLIMBOOKS_LOGO_CID,
            contentType: 'image/png'
          });
        }
      }

      const { error } = await withTimeout(
        resend.emails.send({
          from,
          to: input.to,
          subject: input.subject,
          text: input.text || '',
          html,
          ...(attachments.length > 0 ? { attachments } : {})
        }),
        EMAIL_SEND_TIMEOUT_MS,
        'Resend email send'
      );

      if (error) {
        return { success: false, message: `Resend send failed: ${error.message}` };
      }

      return { success: true, message: 'Email sent successfully' };
    } catch (error) {
      return { success: false, message: `Email send failed: ${(error as Error).message}` };
    }
  }

  async send(input: EmailMessageInput): Promise<EmailSendResult> {
    return this.sendEmail(input);
  }
}

export const emailProviderService = EmailProviderService.getInstance();
