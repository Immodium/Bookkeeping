
import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { toast } from 'sonner';
import { themeClasses } from '@/utils/themeUtils.util';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme.hook';
import { getToken } from '@/utils/api';
import type { SettingsTabRef } from '../Settings';

const hueToHex = (hue: number): string => {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const saturation = 78;
  const lightness = 46;
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (normalizedHue < 60) {
    r = c;
    g = x;
  } else if (normalizedHue < 120) {
    r = x;
    g = c;
  } else if (normalizedHue < 180) {
    g = c;
    b = x;
  } else if (normalizedHue < 240) {
    g = x;
    b = c;
  } else if (normalizedHue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const hexToHue = (hex: string): number => {
  const normalized = hex.replace('#', '');
  if (!/^([a-fA-F0-9]{6})$/.test(normalized)) {
    return 0;
  }

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) {
    return 0;
  }

  let hue = 0;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  return Math.round((hue * 60 + 360) % 360);
};

export const AppearanceSettingsTab = forwardRef<SettingsTabRef>((props, ref) => {
  const { isAdmin, user } = useAuth();
  const { setAccentColor: setGlobalAccentColor } = useTheme();
  const [invoiceTemplate, setInvoiceTemplate] = useState('modern-blue');
  const [pdfFormat, setPdfFormat] = useState('A4');
  const [accentMode, setAccentMode] = useState<'preset' | 'custom'>('preset');
  const [accentColor, setAccentColor] = useState('#1d4ed8');
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string>('');
  const presetAccentColors = [
    '#1d4ed8',
    '#2563eb',
    '#0f766e',
    '#7c3aed',
    '#be123c',
    '#c2410c',
    '#0891b2',
    '#ca8a04'
  ];

  // Manual save function for Save button
  const saveSettings = async () => {
    if (!isLoaded) return;
    
    // Clear any previous error
    setSaveError('');
    
    // Check if user has admin privileges before attempting save
    if (!isAdmin) {
      const error = 'Admin privileges required to save settings. Contact your administrator.';
      setSaveError(error);
      console.error('Settings save blocked:', error, 'User role:', user?.role);
      throw new Error(error);
    }

    try {
      const settingsToSave = {
        'invoice_template': { value: invoiceTemplate, category: 'appearance' },
        'pdf_format': { value: { format: pdfFormat }, category: 'appearance' },
        'accent_mode': { value: accentMode, category: 'appearance' },
        'accent_color': { value: accentColor, category: 'appearance' }
      };

      const response = await fetch('/api/settings/appearance', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ settings: settingsToSave })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to save appearance settings');
      }

      setSaveError(''); // Clear any previous errors on success
      toast.success('Appearance settings saved successfully');
    } catch (error) {
      console.error('Error saving appearance settings:', error);
      
      // Set user-friendly error message
      if (error.message?.includes('Authentication required')) {
        setSaveError('Authentication failed. Please try logging in again.');
      } else if (error.message?.includes('Admin access required') || error.message?.includes('Insufficient permissions')) {
        setSaveError('Admin privileges required to save settings.');
      } else {
        setSaveError(`Failed to save settings: ${error.message}`);
      }
      toast.error(`Failed to save appearance settings: ${error.message}`);
      throw error;
    }
  };

  // Load settings from database on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Use dynamic import to avoid circular dependencies
        const { sqliteService } = await import('@/services/apiClient.svc');
        
        if (!sqliteService.isReady()) {
          await sqliteService.initialize();
        }

        const settings = await sqliteService.getAllSettings('appearance');

        // Migrate from localStorage if database settings don't exist
        if (!settings || (!settings.theme && !settings.invoice_template)) {
          const localTemplate = localStorage.getItem('invoiceTemplate') || 'modern-blue';
          setInvoiceTemplate(localTemplate);
          setPdfFormat('A4'); // Default PDF format
          setAccentMode('preset');
          setAccentColor('#1d4ed8');

          // Save to database and clear localStorage
          await sqliteService.setMultipleSettings({
            'invoice_template': { value: localTemplate, category: 'appearance' },
            'pdf_format': { value: { format: 'A4' }, category: 'appearance' },
            'accent_mode': { value: 'preset', category: 'appearance' },
            'accent_color': { value: '#1d4ed8', category: 'appearance' }
          });
          
          // Let useTheme hook handle theme migration
          localStorage.removeItem('invoiceTemplate');
        } else {
          // Use database settings with proper type checking
          // Theme is already handled by useTheme hook
          if (settings?.invoice_template && typeof settings.invoice_template === 'string') {
            setInvoiceTemplate(settings.invoice_template);
          }
          if (settings?.pdf_format) {
            const pdfFormatValue = typeof settings.pdf_format === 'object' && settings.pdf_format !== null && 'format' in settings.pdf_format
              ? (settings.pdf_format as { format: string }).format
              : typeof settings.pdf_format === 'string'
              ? settings.pdf_format
              : 'A4';
            setPdfFormat(pdfFormatValue || 'A4');
          }
          if (typeof settings?.accent_mode === 'string') {
            setAccentMode(settings.accent_mode === 'custom' ? 'custom' : 'preset');
          }
          if (typeof settings?.accent_color === 'string') {
            setAccentColor(settings.accent_color);
            setGlobalAccentColor(settings.accent_color, false);
          }
        }

        setIsLoaded(true);
      } catch (error) {
        console.error('Error loading appearance settings:', error);
        setIsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  // Theme changes are now handled by useTheme hook

  // Expose saveSettings method to parent component
  useImperativeHandle(ref, () => ({
    saveSettings: async () => {
      try {
        await saveSettings();
      } catch (error) {
        console.error('Error saving appearance settings:', error);
        throw error;
      }
    }
  }), [invoiceTemplate, pdfFormat, isLoaded, isAdmin, user?.role]);

  const handleInvoiceTemplateChange = (newTemplate: string) => {
    setInvoiceTemplate(newTemplate);
  };

  const handlePresetAccentSelect = (color: string) => {
    setAccentMode('preset');
    setAccentColor(color);
    setGlobalAccentColor(color, false);
  };

  const handleCustomAccentColorChange = (color: string) => {
    setAccentMode('custom');
    setAccentColor(color);
    setGlobalAccentColor(color, false);
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-card-foreground">Appearance</h3>
        {!isAdmin && (
          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
            Read Only - Admin access required
          </span>
        )}
      </div>
      
      {saveError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{saveError}</p>
        </div>
      )}
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Invoice Template</label>
          <select
            value={invoiceTemplate}
            onChange={(e) => handleInvoiceTemplateChange(e.target.value)}
            disabled={!isAdmin}
            className={`w-full ${themeClasses.select} ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <option value="modern-blue">Modern Blue</option>
            <option value="classic-white">Classic White</option>
            <option value="professional-gray">Professional Gray</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Accent Color</label>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {presetAccentColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => handlePresetAccentSelect(color)}
                  disabled={!isAdmin}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    accentColor.toLowerCase() === color.toLowerCase()
                      ? 'border-foreground scale-110'
                      : 'border-border'
                  } ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
                  style={{ backgroundColor: color }}
                  title={`Select accent ${color}`}
                />
              ))}
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-2">
                Custom accent
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => handleCustomAccentColorChange(e.target.value)}
                  disabled={!isAdmin}
                  className={`h-10 w-16 rounded border border-input bg-background p-1 ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={hexToHue(accentColor)}
                  onChange={(e) => {
                    handleCustomAccentColorChange(hueToHex(Number(e.target.value)));
                  }}
                  disabled={!isAdmin}
                  className={`flex-1 ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
                <div className="text-xs font-mono text-muted-foreground">{accentColor}</div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Pick a swatch or create your own accent color.
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">PDF Format</label>
          <select
            value={pdfFormat}
            onChange={(e) => setPdfFormat(e.target.value)}
            disabled={!isAdmin}
            className={`w-full ${themeClasses.select} ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <option value="A4">A4 (210 × 297 mm)</option>
            <option value="Letter">Letter (8.5 × 11 in)</option>
            <option value="Legal">Legal (8.5 × 14 in)</option>
            <option value="A3">A3 (297 × 420 mm)</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Choose the default paper size for PDF invoices and reports
          </p>
        </div>

      </div>
    </div>
  );
});

AppearanceSettingsTab.displayName = 'AppearanceSettingsTab';
