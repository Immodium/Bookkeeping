import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { Resend } from 'resend';
import { settingsService } from './SettingsService.js';
import { emailConfig } from '../config/index.js';

type EmailProvider = 'smtp' | 'sendgrid' | 'resend';

export interface EmailSendResult {
  success: boolean;
  message: string;
}

export interface EmailMessageInput {
  to: string;
  subject: string;
  html?: string | undefined;
  text?: string | undefined;
}

interface ResolvedEmailSettings {
  isEnabled: boolean;
  provider: EmailProvider;
  fromEmail: string;
  fromName: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  sendgrid: {
    apiKey: string;
    from: string;
  };
  resend: {
    apiKey: string;
  };
}

const asString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const asNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const asBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return fallback;
};

export class EmailProviderService {
  private static instance: EmailProviderService;

  static getInstance(): EmailProviderService {
    if (!EmailProviderService.instance) {
      EmailProviderService.instance = new EmailProviderService();
    }
    return EmailProviderService.instance;
  }

  private extractTenantId(overrides?: Record<string, unknown>): number {
    const raw = overrides?.tenantId;
    if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
      return raw;
    }
    return 1;
  }

  private async resolveSettings(overrides?: Record<string, unknown>): Promise<ResolvedEmailSettings> {
    const tenantId = this.extractTenantId(overrides);
    const saved = await settingsService.getSettingByKey('email.email_settings', tenantId);
    const persisted = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
    const settings = { ...persisted, ...(overrides || {}) };

    const providerRaw = asString(settings.provider || process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();
    const provider: EmailProvider = providerRaw === 'sendgrid' ? 'sendgrid' : providerRaw === 'resend' ? 'resend' : 'smtp';

    const fromEmail = asString(settings.from_email || settings.email_from || process.env.EMAIL_FROM || emailConfig.from);
    const fromName = asString(settings.from_name || process.env.EMAIL_FROM_NAME || 'Slimbooks');

    return {
      isEnabled: asBoolean(settings.isEnabled ?? settings.enabled ?? process.env.EMAIL_ENABLED, false),
      provider,
      fromEmail,
      fromName,
      smtp: {
        host: asString(settings.smtp_host || process.env.SMTP_HOST || emailConfig.smtp.host || ''),
        port: asNumber(settings.smtp_port || process.env.SMTP_PORT || emailConfig.smtp.port, 587),
        secure: asBoolean(settings.smtp_secure ?? process.env.SMTP_SECURE ?? emailConfig.smtp.secure, false),
        user: asString(settings.smtp_user || process.env.SMTP_USER || emailConfig.smtp.auth.user || ''),
        pass: asString(settings.smtp_password || settings.smtp_pass || process.env.SMTP_PASS || emailConfig.smtp.auth.pass || '')
      },
      sendgrid: {
        apiKey: asString(settings.sendgrid_api_key || process.env.SENDGRID_API_KEY || ''),
        from: asString(
          settings.sendgrid_from ||
          process.env.SENDGRID_FROM ||
          process.env.EMAIL_FROM ||
          emailConfig.sendgridFrom
        )
      },
      resend: {
        apiKey: asString(settings.resend_api_key || process.env.RESEND_API_KEY || '')
      }
    };
  }

  async testConnection(overrides?: Record<string, unknown>): Promise<EmailSendResult> {
    const settings = await this.resolveSettings(overrides);
    if (!settings.isEnabled) {
      return { success: false, message: 'Email sending is disabled' };
    }

    if (settings.provider === 'sendgrid') {
      if (!settings.sendgrid.apiKey || !settings.sendgrid.from) {
        return { success: false, message: 'SendGrid API key and sender email are required' };
      }
      try {
        sgMail.setApiKey(settings.sendgrid.apiKey);
        return { success: true, message: 'SendGrid configuration looks valid' };
      } catch (error) {
        return {
          success: false,
          message: `SendGrid connection failed: ${(error as Error).message}`
        };
      }
    }

    if (settings.provider === 'resend') {
      if (!settings.resend.apiKey) {
        return { success: false, message: 'Resend API key is required' };
      }
      if (!settings.fromEmail) {
        return { success: false, message: 'From email is required for Resend' };
      }
      return { success: true, message: 'Resend configuration looks valid' };
    }

    if (!settings.smtp.host || !settings.smtp.user || !settings.smtp.pass) {
      return { success: false, message: 'Missing SMTP configuration' };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: settings.smtp.host,
        port: settings.smtp.port,
        secure: settings.smtp.secure,
        auth: {
          user: settings.smtp.user,
          pass: settings.smtp.pass
        }
      });
      await transporter.verify();
      return { success: true, message: 'SMTP connection verified successfully' };
    } catch (error) {
      return {
        success: false,
        message: `SMTP connection failed: ${(error as Error).message}`
      };
    }
  }

  async sendTestEmail(
    to: string,
    overrides?: Record<string, unknown>
  ): Promise<EmailSendResult> {
    return this.sendEmail({
      to,
      subject: 'Slimbooks test email',
      html: '<p>This is a test email from Slimbooks.</p>',
      text: 'This is a test email from Slimbooks.'
    }, overrides);
  }

  async send(input: EmailMessageInput, overrides?: Record<string, unknown>): Promise<EmailSendResult> {
    return this.sendEmail(input, overrides);
  }

  async sendEmail(input: EmailMessageInput, overrides?: Record<string, unknown>): Promise<EmailSendResult> {
    const settings = await this.resolveSettings(overrides);
    if (!settings.isEnabled) {
      return { success: false, message: 'Email sending is disabled' };
    }
    if (!input.to || !input.subject) {
      return { success: false, message: 'Recipient and subject are required' };
    }
    if (!settings.fromEmail) {
      return { success: false, message: 'From email is not configured' };
    }

    if (settings.provider === 'sendgrid') {
      if (!settings.sendgrid.apiKey || !settings.sendgrid.from) {
        return { success: false, message: 'SendGrid API key and sender email are required' };
      }
      try {
        sgMail.setApiKey(settings.sendgrid.apiKey);
        await sgMail.send({
          to: input.to,
          from: {
            email: settings.sendgrid.from,
            name: settings.fromName || 'Slimbooks'
          },
          subject: input.subject,
          text: input.text || '',
          html: input.html || input.text || ''
        });
        return { success: true, message: 'Email sent successfully via SendGrid' };
      } catch (error) {
        return { success: false, message: `SendGrid send failed: ${(error as Error).message}` };
      }
    }

    if (settings.provider === 'resend') {
      if (!settings.resend.apiKey) {
        return { success: false, message: 'Resend API key is required' };
      }
      try {
        const resend = new Resend(settings.resend.apiKey);
        const from = settings.fromName
          ? `${settings.fromName} <${settings.fromEmail}>`
          : settings.fromEmail;
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
        return { success: true, message: 'Email sent successfully via Resend' };
      } catch (error) {
        return { success: false, message: `Resend send failed: ${(error as Error).message}` };
      }
    }

    if (!settings.smtp.host || !settings.smtp.user || !settings.smtp.pass) {
      return { success: false, message: 'Missing SMTP configuration' };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: settings.smtp.host,
        port: settings.smtp.port,
        secure: settings.smtp.secure,
        auth: {
          user: settings.smtp.user,
          pass: settings.smtp.pass
        }
      });

      await transporter.sendMail({
        from: settings.fromName
          ? `"${settings.fromName}" <${settings.fromEmail}>`
          : settings.fromEmail,
        to: input.to,
        subject: input.subject,
        text: input.text || '',
        html: input.html || input.text || ''
      });
      return { success: true, message: 'Email sent successfully via SMTP' };
    } catch (error) {
      return { success: false, message: `SMTP send failed: ${(error as Error).message}` };
    }
  }
}

export const emailProviderService = EmailProviderService.getInstance();
