// Email Template Service for Slimbooks
// Centralised, per-tenant-customisable template system using simple {{variable}} interpolation

import { databaseService } from '../core/DatabaseService.js';

interface TemplateVariables {
  [key: string]: string | number | undefined;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface TemplateDefinition {
  subject: string;
  html: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------

function buildLayout(subject: string, headerHtml: string, contentHtml: string, companyName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background-color:#1a1a2e;border-radius:12px 12px 0 0;padding:32px;text-align:center;">
            ${headerHtml}
          </td>
        </tr>
        <!-- Content -->
        <tr>
          <td style="background-color:#ffffff;padding:40px 48px;">
            ${contentHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background-color:#f9f9f9;border-radius:0 0 12px 12px;padding:24px;text-align:center;border-top:1px solid #e5e5e5;">
            <p style="margin:0 0 4px;font-size:13px;color:#666;">${companyName}</p>
            <p style="margin:0;font-size:11px;color:#999;">Powered by Slimbooks</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background-color:#6366f1;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;margin:24px 0;">${label}</a>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#333333;">${text}</h1>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">${text}</p>`;
}

// ---------------------------------------------------------------------------
// Built-in template content (HTML body fragments only — layout added in render)
// ---------------------------------------------------------------------------

const BUILT_IN_TEMPLATES: Record<string, TemplateDefinition> = {
  welcome: {
    subject: 'Welcome to Slimbooks — your 14-day trial has started',
    html: `${h1('Welcome, {{name}}!')}
${p('Your 14-day free trial is now active. Get started by exploring your dashboard and setting up your company profile.')}
${p('During your trial you have full access to all features — invoicing, expense tracking, retainers and financial reports.')}
<div style="text-align:center;">${btn('{{app_url}}', 'Go to Dashboard')}</div>
${p('If you have any questions, just reply to this email — we are here to help.')}`,
    text: 'Hi {{name}}, welcome! Your 14-day trial is active. Visit: {{app_url}}'
  },

  password_reset: {
    subject: 'Reset your Slimbooks password',
    html: `${h1('Reset your password')}
${p('Hi {{name}},')}
${p('We received a request to reset your password. Click the button below — this link expires in 1 hour.')}
<div style="text-align:center;">${btn('{{reset_url}}', 'Reset Password')}</div>
${p('If you did not request a password reset you can safely ignore this email.')}`,
    text: 'Hi {{name}}, reset your password: {{reset_url}} (expires in 1 hour)'
  },

  invitation: {
    subject: 'You have been invited to {{tenant_name}}',
    html: `${h1('You have been invited!')}
${p('Hi {{name}},')}
${p('You have been invited to join <strong>{{tenant_name}}</strong> on Slimbooks. Your temporary credentials are below:')}
<table cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;border-radius:8px;padding:20px 24px;margin:20px 0;width:100%;">
  <tr><td style="font-size:14px;color:#666;padding-bottom:6px;">Email</td><td style="font-size:14px;font-weight:600;color:#333;">{{name}}</td></tr>
  <tr><td style="font-size:14px;color:#666;padding-top:6px;">Temporary Password</td><td style="font-size:14px;font-weight:600;color:#333;font-family:monospace;">{{temp_password}}</td></tr>
</table>
${p('Please sign in and change your password immediately.')}
<div style="text-align:center;">${btn('{{app_url}}', 'Sign In Now')}</div>`,
    text: 'Hi {{name}}, you have been invited to {{tenant_name}}. Temp password: {{temp_password}}. Sign in: {{app_url}}'
  },

  invoice: {
    subject: 'Invoice {{invoice_number}} from {{company_name}}',
    html: `${h1('Invoice {{invoice_number}}')}
${p('Hi {{client_name}},')}
${p('Please find your invoice details below.')}
<table cellpadding="0" cellspacing="0" style="background-color:#f9f9f9;border-radius:8px;padding:20px 24px;margin:20px 0;width:100%;border-collapse:collapse;">
  <tr>
    <td style="font-size:14px;color:#666;padding:6px 0;">Invoice Number</td>
    <td style="font-size:14px;font-weight:600;color:#333;text-align:right;">{{invoice_number}}</td>
  </tr>
  <tr>
    <td style="font-size:14px;color:#666;padding:6px 0;">Invoice Date</td>
    <td style="font-size:14px;font-weight:600;color:#333;text-align:right;">{{invoice_date}}</td>
  </tr>
  <tr>
    <td style="font-size:14px;color:#666;padding:6px 0;">Due Date</td>
    <td style="font-size:14px;font-weight:600;color:#333;text-align:right;">{{due_date}}</td>
  </tr>
  <tr style="border-top:2px solid #e5e5e5;">
    <td style="font-size:16px;font-weight:700;color:#333;padding-top:12px;">Total Due</td>
    <td style="font-size:18px;font-weight:700;color:#6366f1;text-align:right;padding-top:12px;">{{total_amount}}</td>
  </tr>
</table>
{{line_items_html}}
<div style="text-align:center;">${btn('{{invoice_url}}', 'View Invoice')}</div>
${p('Thank you for your business!')}`,
    text: 'Hi {{client_name}}, invoice {{invoice_number}} for {{total_amount}} is due on {{due_date}}. View: {{invoice_url}}'
  },

  retainer: {
    subject: 'Retainer Agreement — {{retainer_name}}',
    html: `${h1('Retainer Agreement')}
${p('Hi {{client_name}},')}
${p('Your retainer agreement has been set up. Here are the details:')}
<table cellpadding="0" cellspacing="0" style="background-color:#f9f9f9;border-radius:8px;padding:20px 24px;margin:20px 0;width:100%;border-collapse:collapse;">
  <tr>
    <td style="font-size:14px;color:#666;padding:6px 0;">Retainer Name</td>
    <td style="font-size:14px;font-weight:600;color:#333;text-align:right;">{{retainer_name}}</td>
  </tr>
  <tr>
    <td style="font-size:14px;color:#666;padding:6px 0;">Amount</td>
    <td style="font-size:16px;font-weight:700;color:#6366f1;text-align:right;">{{amount}}</td>
  </tr>
  <tr>
    <td style="font-size:14px;color:#666;padding:6px 0;">Billing Cycle</td>
    <td style="font-size:14px;font-weight:600;color:#333;text-align:right;text-transform:capitalize;">{{billing_cycle}}</td>
  </tr>
  <tr>
    <td style="font-size:14px;color:#666;padding:6px 0;">Start Date</td>
    <td style="font-size:14px;font-weight:600;color:#333;text-align:right;">{{start_date}}</td>
  </tr>
</table>
<div style="text-align:center;">${btn('{{portal_url}}', 'View Retainer Portal')}</div>
${p('Thank you for your continued business!')}`,
    text: 'Hi {{client_name}}, your retainer {{retainer_name}} for {{amount}} ({{billing_cycle}}) starts {{start_date}}. View: {{portal_url}}'
  },

  report: {
    subject: '{{report_type}} — {{report_period}}',
    html: `${h1('{{report_type}}')}
${p('Hi {{recipient_name}},')}
${p('Your <strong>{{report_type}}</strong> for <strong>{{report_period}}</strong> is ready.')}
{{summary_html}}
<div style="text-align:center;">${btn('{{app_url}}', 'View Full Report')}</div>`,
    text: 'Hi {{recipient_name}}, your {{report_type}} for {{report_period}} is ready. View: {{app_url}}'
  },

  dunning_reminder_1: {
    subject: 'Payment failed — please update your payment method',
    html: `${h1('Payment failed')}
${p('Hi {{name}},')}
${p('Your recent payment failed. To avoid any interruption to your service, please update your payment method as soon as possible.')}
<div style="text-align:center;">${btn('{{portal_url}}', 'Update Payment Method')}</div>
${p('If you believe this is an error, please contact us.')}`,
    text: 'Hi {{name}}, your recent payment failed. Update your payment method: {{portal_url}}'
  },

  dunning_reminder_2: {
    subject: 'Action required — your account will be suspended in {{days_remaining}} days',
    html: `${h1('Urgent: Account suspension in {{days_remaining}} days')}
${p('Hi {{name}},')}
${p('Your account will be suspended in <strong>{{days_remaining}} days</strong> if payment is not received.')}
${p('Please update your payment method immediately to keep your account active.')}
<div style="text-align:center;">${btn('{{portal_url}}', 'Update Now')}</div>`,
    text: 'Hi {{name}}, your account will be suspended in {{days_remaining}} days. Update: {{portal_url}}'
  },

  dunning_final_notice: {
    subject: 'Final notice — your account will be suspended today',
    html: `${h1('Final Notice')}
${p('Hi {{name}},')}
${p('This is your final notice. Your account will be suspended <strong>today</strong> if payment is not received.')}
${p('Please update your payment method immediately.')}
<div style="text-align:center;margin-bottom:16px;"><a href="{{portal_url}}" style="display:inline-block;background-color:#dc2626;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">Update Payment Method</a></div>`,
    text: 'Hi {{name}}, final notice: your account will be suspended today. Update: {{portal_url}}'
  }
};

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

function interpolate(template: string, variables: TemplateVariables): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = variables[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

class EmailTemplateService {
  private settingKey(name: string): string {
    return `email.template.${name}`;
  }

  /**
   * Fetch company branding (name + logo URL) from the settings table.
   */
  private async getCompanyBranding(tenantId: number): Promise<{ company_name: string; company_logo_url: string }> {
    try {
      const row = await databaseService.getOne<{ value: string }>(
        "SELECT value FROM settings WHERE tenant_id = ? AND key = 'company.company_settings'",
        [tenantId]
      );
      if (row?.value) {
        const settings = JSON.parse(row.value) as Record<string, string>;
        const companyName = settings.companyName || 'Slimbooks';
        let logoUrl = '';
        if (settings.brandingImage && settings.brandingImage.trim() !== '') {
          const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
          const brandingPath = settings.brandingImage.startsWith('/') ? settings.brandingImage : `/${settings.brandingImage}`;
          logoUrl = `${appUrl}${brandingPath}`;
        }
        return { company_name: companyName, company_logo_url: logoUrl };
      }
    } catch {
      // ignore — fall through to defaults
    }
    return { company_name: 'Slimbooks', company_logo_url: '' };
  }

  /**
   * Render a template with variables.
   * Auto-fetches company branding and injects it.
   * Looks up tenant override first, then falls back to built-in.
   */
  async render(templateName: string, variables: TemplateVariables, tenantId?: number): Promise<RenderedEmail> {
    let tpl: TemplateDefinition | null = null;

    // Fetch company branding
    const branding = tenantId
      ? await this.getCompanyBranding(tenantId)
      : { company_name: 'Slimbooks', company_logo_url: '' };

    // Try tenant override
    if (tenantId) {
      const key = this.settingKey(templateName);
      const row = await databaseService.getOne<{ value: string }>(
        'SELECT value FROM settings WHERE tenant_id = ? AND key = ?',
        [tenantId, key]
      );
      if (row?.value) {
        try {
          tpl = JSON.parse(row.value) as TemplateDefinition;
        } catch {
          tpl = null;
        }
      }
    }

    // Fall back to built-in
    if (!tpl) {
      tpl = BUILT_IN_TEMPLATES[templateName] ?? null;
    }

    if (!tpl) {
      throw new Error(`Unknown email template: ${templateName}`);
    }

    // Build company header HTML
    const companyHeaderHtml = branding.company_logo_url
      ? `<img src="${branding.company_logo_url}" alt="${branding.company_name}" style="max-height:60px;max-width:200px;object-fit:contain;" />`
      : `<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">${branding.company_name}</h1>`;

    // Merge branding into variables (user-supplied vars take precedence for company_name override)
    const allVars: TemplateVariables = {
      company_name: branding.company_name,
      company_logo_url: branding.company_logo_url,
      company_header_html: companyHeaderHtml,
      ...variables
    };

    const subject = interpolate(tpl.subject, allVars);

    // For HTML: wrap content in full layout
    const rawBodyHtml = interpolate(tpl.html, allVars);
    const finalHeaderHtml = interpolate(companyHeaderHtml, allVars);
    const html = buildLayout(subject, finalHeaderHtml, rawBodyHtml, String(allVars.company_name || 'Slimbooks'));

    const text = interpolate(tpl.text, allVars);

    return { subject, html, text };
  }

  /**
   * List all template names and whether a tenant override exists.
   */
  async listTemplates(tenantId: number): Promise<Array<{ name: string; hasOverride: boolean; subject: string }>> {
    const results: Array<{ name: string; hasOverride: boolean; subject: string }> = [];

    const rows = await databaseService.getMany<{ key: string; value: string }>(
      `SELECT key, value FROM settings WHERE tenant_id = ? AND key LIKE 'email.template.%'`,
      [tenantId]
    );
    const overrideMap = new Map<string, TemplateDefinition>();
    for (const row of rows) {
      try {
        overrideMap.set(row.key, JSON.parse(row.value) as TemplateDefinition);
      } catch {
        // ignore invalid JSON
      }
    }

    for (const name of Object.keys(BUILT_IN_TEMPLATES)) {
      const key = this.settingKey(name);
      const override = overrideMap.get(key);
      const builtIn = BUILT_IN_TEMPLATES[name]!;
      results.push({
        name,
        hasOverride: Boolean(override),
        subject: override ? override.subject : builtIn.subject
      });
    }
    return results;
  }

  /**
   * Save a tenant-level template override to the settings table.
   */
  async saveTemplate(templateName: string, template: TemplateDefinition, tenantId: number): Promise<void> {
    if (!BUILT_IN_TEMPLATES[templateName]) {
      throw new Error(`Unknown email template: ${templateName}`);
    }
    const key = this.settingKey(templateName);
    const value = JSON.stringify(template);

    const existing = await databaseService.getOne<{ id: number }>(
      'SELECT id FROM settings WHERE tenant_id = ? AND key = ?',
      [tenantId, key]
    );
    if (existing) {
      await databaseService.executeQuery(
        "UPDATE settings SET value = ?, updated_at = NOW() WHERE tenant_id = ? AND key = ?",
        [value, tenantId, key]
      );
    } else {
      await databaseService.executeQuery(
        "INSERT INTO settings (tenant_id, key, value, category, created_at, updated_at) VALUES (?, ?, ?, 'email', NOW(), NOW())",
        [tenantId, key, value]
      );
    }
  }

  /**
   * Delete a tenant override (revert to built-in).
   */
  async deleteTemplate(templateName: string, tenantId: number): Promise<void> {
    const key = this.settingKey(templateName);
    await databaseService.executeQuery(
      'DELETE FROM settings WHERE tenant_id = ? AND key = ?',
      [tenantId, key]
    );
  }

  /**
   * Expose built-in template names for preview purposes.
   */
  getBuiltInTemplateNames(): string[] {
    return Object.keys(BUILT_IN_TEMPLATES);
  }

  /**
   * Get a built-in template definition (for preview with dummy vars).
   */
  getBuiltInTemplate(name: string): TemplateDefinition | null {
    return BUILT_IN_TEMPLATES[name] || null;
  }
}

export const emailTemplateService = new EmailTemplateService();
