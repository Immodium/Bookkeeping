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

// Built-in templates (defaults when no tenant override exists)
const BUILT_IN_TEMPLATES: Record<string, TemplateDefinition> = {
  welcome: {
    subject: 'Welcome to Slimbooks — your 14-day trial has started',
    html: '<p>Hi {{name}},</p><p>Welcome! Your 14-day trial is active. <a href="{{app_url}}">Go to your dashboard</a>.</p>',
    text: 'Hi {{name}}, welcome! Your 14-day trial is active. Visit: {{app_url}}'
  },
  password_reset: {
    subject: 'Reset your Slimbooks password',
    html: '<p>Hi {{name}},</p><p><a href="{{reset_url}}">Click here to reset your password</a>. This link expires in 1 hour.</p>',
    text: 'Hi {{name}}, reset your password: {{reset_url}} (expires in 1 hour)'
  },
  invitation: {
    subject: 'You have been invited to Slimbooks',
    html: '<p>Hi {{name}},</p><p>You have been invited to join <strong>{{tenant_name}}</strong>. Temporary password: <code>{{temp_password}}</code>. <a href="{{app_url}}">Sign in here</a>.</p>',
    text: 'Hi {{name}}, you have been invited to {{tenant_name}}. Temp password: {{temp_password}}. Sign in: {{app_url}}'
  },
  dunning_reminder_1: {
    subject: 'Payment failed — please update your payment method',
    html: '<p>Hi {{name}},</p><p>Your recent payment failed. <a href="{{portal_url}}">Update your payment method</a> to avoid service interruption.</p>',
    text: 'Hi {{name}}, your recent payment failed. Update your payment method: {{portal_url}}'
  },
  dunning_reminder_2: {
    subject: 'Action required — your account will be suspended in {{days_remaining}} days',
    html: '<p>Hi {{name}},</p><p>Your account will be suspended in <strong>{{days_remaining}} days</strong> if payment is not received. <a href="{{portal_url}}">Update now</a>.</p>',
    text: 'Hi {{name}}, your account will be suspended in {{days_remaining}} days. Update: {{portal_url}}'
  },
  dunning_final_notice: {
    subject: 'Final notice — your account will be suspended today',
    html: '<p>Hi {{name}},</p><p>This is your final notice. Your account will be suspended today. <a href="{{portal_url}}">Update your payment method</a> immediately.</p>',
    text: 'Hi {{name}}, final notice: your account will be suspended today. Update: {{portal_url}}'
  }
};

function interpolate(template: string, variables: TemplateVariables): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = variables[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

class EmailTemplateService {
  private settingKey(name: string): string {
    return `email.template.${name}`;
  }

  /**
   * Render a template with variables.
   * Looks up tenant override first, then falls back to built-in.
   */
  async render(templateName: string, variables: TemplateVariables, tenantId?: number): Promise<RenderedEmail> {
    let tpl: TemplateDefinition | null = null;

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
      tpl = BUILT_IN_TEMPLATES[templateName];
    }

    if (!tpl) {
      throw new Error(`Unknown email template: ${templateName}`);
    }

    return {
      subject: interpolate(tpl.subject, variables),
      html: interpolate(tpl.html, variables),
      text: interpolate(tpl.text, variables)
    };
  }

  /**
   * List all template names and whether a tenant override exists.
   */
  async listTemplates(tenantId: number): Promise<Array<{ name: string; hasOverride: boolean; subject: string }>> {
    const keys = Object.keys(BUILT_IN_TEMPLATES).map(name => this.settingKey(name));
    const results: Array<{ name: string; hasOverride: boolean; subject: string }> = [];

    // Get all overrides for this tenant in one query
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
        "UPDATE settings SET value = ?, updated_at = datetime('now') WHERE tenant_id = ? AND key = ?",
        [value, tenantId, key]
      );
    } else {
      await databaseService.executeQuery(
        "INSERT INTO settings (tenant_id, key, value, category, created_at, updated_at) VALUES (?, ?, ?, 'email', datetime('now'), datetime('now'))",
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
