import { Resend } from 'resend';

const FROM_DOMAIN = 'slimbooks.io';
const DEFAULT_FROM = `no-reply@${FROM_DOMAIN}`;

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
      const configuredFrom = (process.env.EMAIL_FROM || DEFAULT_FROM).trim();
      const fallbackFrom = configuredFrom.includes('@') ? configuredFrom : DEFAULT_FROM;
      const tenantScopedFrom = process.env.RESEND_TENANT_SCOPED_FROM === 'true';
      const domain = fallbackFrom.split('@')[1] || FROM_DOMAIN;
      const fromAddress = tenantScopedFrom ? `no-reply-${tenantId}@${domain}` : fallbackFrom;
      const from = input.fromName ? `${input.fromName} <${fromAddress}>` : fromAddress;

      const { error } = await resend.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text || '',
        html: input.html || input.text || ''
      });

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
