import { Resend } from 'resend';

const FROM_DOMAIN = 'slimbooks.io';

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

      const { error } = await withTimeout(
        resend.emails.send({
          from,
          to: input.to,
          subject: input.subject,
          text: input.text || '',
          html: input.html || input.text || ''
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
