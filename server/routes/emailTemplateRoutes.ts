// Email template management routes
// Allows admins to list, preview, override, and delete per-tenant email templates

import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { emailTemplateService } from '../services/EmailTemplateService.js';

const router: Router = Router();

router.use(requireAuth);
router.use(requireAdmin);

const DUMMY_VARS: Record<string, string> = {
  name: 'Jane Doe',
  app_url: 'http://localhost:5173',
  reset_url: 'http://localhost:5173/reset-password?token=example',
  tenant_name: 'Acme Corp',
  temp_password: 'TempPass1!',
  portal_url: 'http://localhost:5173/billing',
  days_remaining: '9'
};

/**
 * GET /api/email-templates
 * List all templates with override status.
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const templates = await emailTemplateService.listTemplates(tenantId);
    res.json({ success: true, data: templates });
  })
);

/**
 * GET /api/email-templates/:name
 * Get rendered preview of a template with dummy variables.
 */
router.get(
  '/:name',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const name = req.params.name!;
    const tenantId = req.tenantId || req.user?.tenant_id || 1;

    const knownNames = emailTemplateService.getBuiltInTemplateNames();
    if (!knownNames.includes(name)) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    const rendered = await emailTemplateService.render(name, DUMMY_VARS, tenantId);
    res.json({ success: true, data: { name, ...rendered } });
  })
);

/**
 * PUT /api/email-templates/:name
 * Save a tenant-level override for a template.
 * Body: { subject, html, text }
 */
router.put(
  '/:name',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const name = req.params.name!;
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const { subject, html, text } = req.body || {};

    if (!subject || !html || !text) {
      res.status(400).json({ success: false, error: 'subject, html, and text are required' });
      return;
    }

    await emailTemplateService.saveTemplate(name, { subject, html, text }, tenantId);
    res.json({ success: true, message: 'Template override saved' });
  })
);

/**
 * DELETE /api/email-templates/:name
 * Revert a template to the built-in default.
 */
router.delete(
  '/:name',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const name = req.params.name!;
    const tenantId = req.tenantId || req.user?.tenant_id || 1;

    await emailTemplateService.deleteTemplate(name, tenantId);
    res.json({ success: true, message: 'Template override deleted; reverted to built-in' });
  })
);

export default router;
