// Settings routes for Slimbooks
// Handles application settings and project configuration endpoints

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { getStorageProvider } from '../storage/index.js';
import {
  getAllSettings,
  getSettingByKey,
  saveSetting,
  saveMultipleSettings
} from '../controllers/settingsController.js';
import { requireAuth, requireAdmin } from '../middleware/index.js';
import { emailProviderService } from '../services/EmailProviderService.js';

const router: Router = Router();

const LOGO_STORAGE_PREFIX = 'logos';

const extractStorageKeyFromPublicUrl = (url: string | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('/uploads/')) {
    return url.slice('/uploads/'.length);
  }
  const bucketPattern = /\.s3[.-][^/]+\.amazonaws\.com\//;
  if (bucketPattern.test(url)) {
    return url.replace(/^https?:\/\/[^/]+\//, '');
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return null;
  }
  return url.replace(/^\/+/, '');
};

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for images
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  }
});

// Public settings (no auth required)

// Get currency format settings (public for UI formatting)
router.get('/currency', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { settingsService } = await import('../services/SettingsService.js');
    const result = await settingsService.getSettingByKey('general.currency_format_settings');

    if (result) {
      res.json({ success: true, value: result });
    } else {
      // Return default currency format settings
      res.json({
        success: true,
        value: {
          currency: 'USD',
          symbol: '$',
          position: 'before',
          decimal_places: 2,
          thousands_separator: ',',
          decimal_separator: '.'
        }
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get company settings (public for UI display and invoice generation)
router.get('/company', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { settingsService } = await import('../services/SettingsService.js');
    const result = await settingsService.getSettingByKey('company.company_settings');

    if (result) {
      res.json({ success: true, value: result });
    } else {
      // Return default company settings
      res.json({
        success: true,
        value: {
          companyName: '',
          ownerName: '',
          address: '',
          city: '',
          state: '',
          zipCode: '',
          email: '',
          phone: '',
          brandingImage: ''
        }
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Upload company logo (requires auth but not admin)
router.post('/company/logo', requireAuth, uploadImage.single('logo'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    const { settingsService } = await import('../services/SettingsService.js');
    const storageProvider = getStorageProvider();
    const logoObjectKey = `${LOGO_STORAGE_PREFIX}/${randomUUID()}${extname(req.file.originalname) || '.png'}`;
    const uploadResult = await storageProvider.uploadObject({
      key: logoObjectKey,
      body: req.file.buffer,
      contentType: req.file.mimetype || 'application/octet-stream'
    });
    const logoPath = uploadResult.url;

    // Get existing company settings
    const existingSettings = (await settingsService.getSettingByKey('company.company_settings') as Record<string, string>) || {
      companyName: '',
      ownerName: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      email: '',
      phone: '',
      brandingImage: ''
    };

    // Delete old logo object if it exists
    const previousLogoKey = extractStorageKeyFromPublicUrl(existingSettings.brandingImage);
    if (previousLogoKey && previousLogoKey.startsWith(`${LOGO_STORAGE_PREFIX}/`)) {
      try {
        await storageProvider.deleteObject({ key: previousLogoKey });
      } catch (deleteError) {
        console.warn('Could not delete old logo object:', deleteError);
      }
    }

    // Update company settings with new logo path
    const updatedSettings = {
      ...existingSettings,
      brandingImage: logoPath
    };

    await settingsService.saveSetting('company_settings', updatedSettings, 'company');

    res.json({
      success: true,
      logoPath,
      settings: updatedSettings,
      message: 'Logo uploaded and company settings updated successfully'
    });
  } catch (error) {
    console.error('Logo upload error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Delete company logo (requires auth but not admin)
router.delete('/company/logo', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { settingsService } = await import('../services/SettingsService.js');
    const storageProvider = getStorageProvider();

    // Get existing company settings
    const existingSettings = (await settingsService.getSettingByKey('company.company_settings') as Record<string, string>) || {
      companyName: '',
      ownerName: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      email: '',
      phone: '',
      brandingImage: ''
    };

    // Delete logo object if it exists
    const storageKey = extractStorageKeyFromPublicUrl(existingSettings.brandingImage);
    if (storageKey && storageKey.startsWith(`${LOGO_STORAGE_PREFIX}/`)) {
      try {
        await storageProvider.deleteObject({ key: storageKey });
      } catch (deleteError) {
        console.warn('Could not delete logo object:', deleteError);
        // Don't fail request when cleanup fails
      }
    }

    // Update company settings to remove logo path
    const updatedSettings = {
      ...existingSettings,
      brandingImage: ''
    };

    await settingsService.saveSetting('company_settings', updatedSettings, 'company');

    res.json({
      success: true,
      settings: updatedSettings,
      message: 'Logo deleted and company settings updated successfully'
    });
  } catch (error) {
    console.error('Logo delete error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Save company settings (requires auth but not admin)
router.post('/company', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { settingsService } = await import('../services/SettingsService.js');
    const { companyName, ownerName, address, city, state, zipCode, email, phone, brandingImage } = req.body;
    
    // Validate required fields
    if (!companyName || typeof companyName !== 'string') {
      res.status(400).json({ success: false, error: 'Company name is required' });
      return;
    }
    
    // Build company settings object
    const companySettings = {
      companyName: companyName.trim(),
      ownerName: ownerName || '',
      address: address || '',
      city: city || '',
      state: state || '',
      zipCode: zipCode || '',
      email: email || '',
      phone: phone || '',
      brandingImage: brandingImage || ''
    };
    
    await settingsService.saveSetting('company_settings', companySettings, 'company');
    res.json({ success: true, message: 'Company settings saved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get appearance settings (category-based)
router.get('/appearance', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    req.query.category = 'appearance';
    await getAllSettings(req, res, () => {});
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Save appearance settings (user-level, no admin required)
router.put('/appearance', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ success: false, error: 'Settings object is required' });
      return;
    }
    
    // Only allow appearance-related settings to be saved through this endpoint
    const allowedSettings = [
      'theme',
      'invoice_template_preference',
      'pdf_format_preference',
      'accent_mode',
      'accent_color'
    ];
    const filteredSettings: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(settings)) {
      if (allowedSettings.includes(key)) {
        filteredSettings[key] = { ...(value as Record<string, unknown>), category: 'appearance' };
      }
    }
    
    if (Object.keys(filteredSettings).length === 0) {
      res.status(400).json({ success: false, error: 'No valid appearance settings provided' });
      return;
    }
    
    await saveMultipleSettings({ body: { settings: filteredSettings } } as Request, res, () => {});
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get general settings (category-based)
router.get('/general', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const { settingsService } = await import('../services/SettingsService.js');
    const settings = await settingsService.getAllSettings('general');
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get notification settings (specific key)
router.get('/notification', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { settingsService } = await import('../services/SettingsService.js');
    const result = await settingsService.getSettingByKey('general.notification_settings');

    if (result) {
      res.json({ success: true, settings: { notification_settings: result } });
    } else {
      // Return default notification settings
      res.json({
        success: true,
        settings: {
          notification_settings: {
            showToastNotifications: true,
            showSuccessToasts: true,
            showErrorToasts: true,
            showWarningToasts: true,
            showInfoToasts: true,
            toastDuration: 4000,
            toastPosition: 'bottom-right'
          }
        }
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Test email provider connection and optionally send a test email
router.post('/email/test', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { settings, testEmail } = req.body as {
      settings?: Record<string, unknown>;
      testEmail?: string;
    };

    const connectionResult = await emailProviderService.testConnection(settings);
    if (!connectionResult.success) {
      res.status(400).json(connectionResult);
      return;
    }

    if (testEmail) {
      const sendResult = await emailProviderService.sendTestEmail(testEmail, settings);
      if (!sendResult.success) {
        res.status(400).json(sendResult);
        return;
      }
      res.json(sendResult);
      return;
    }

    res.json(connectionResult);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to test email provider'
    });
  }
});

// Send an email using the configured provider
router.post('/email/send', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { to, subject, html, text, settings } = req.body as {
      to?: string;
      subject?: string;
      html?: string;
      text?: string;
      settings?: Record<string, unknown>;
    };

    if (!to || !subject) {
      res.status(400).json({
        success: false,
        message: 'Recipient and subject are required'
      });
      return;
    }

    const payload: {
      to: string;
      subject: string;
      html?: string;
      text?: string;
    } = { to, subject };
    if (html !== undefined) {
      payload.html = html;
    }
    if (text !== undefined) {
      payload.text = text;
    }

    const sendResult = await emailProviderService.sendEmail(payload, settings);

    if (!sendResult.success) {
      res.status(400).json(sendResult);
      return;
    }

    res.json(sendResult);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to send email'
    });
  }
});

// Settings operations (require auth)

// Get all settings or filter by category
router.get('/', requireAuth, getAllSettings);

// Get individual setting by key
router.get('/:key', requireAuth, getSettingByKey);

// Save individual setting
router.post('/', requireAuth, requireAdmin, saveSetting);

// Save multiple settings at once
router.put('/', requireAuth, requireAdmin, saveMultipleSettings);

// Note: Project settings are handled in separate routes at /api/project-settings

export default router;