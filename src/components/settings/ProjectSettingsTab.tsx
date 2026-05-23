import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Globe, CreditCard, Shield, AlertTriangle, CheckCircle, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { themeClasses } from '@/utils/themeUtils.util';
import { toast } from 'sonner';
import { ProjectSettings } from '@/types';
import { useFormNavigation } from '@/hooks/useFormNavigation';
import { EmailSettings } from './EmailSettings';

export interface ProjectSettingsRef {
  saveSettings: () => Promise<void>;
}

export const ProjectSettingsTab = forwardRef<ProjectSettingsRef>((props, ref) => {
  const [settings, setSettings] = useState<ProjectSettings>({
    google_oauth: {
      enabled: false,
      client_id: '',
      client_secret: '',
      configured: false
    },
    stripe: {
      enabled: false,
      publishable_key: '',
      secret_key: '',
      configured: false
    },
    security: {
      require_email_verification: true,
      max_failed_login_attempts: 5,
      account_lockout_duration: 1800000
    }
  });

  const [originalSettings, setOriginalSettings] = useState<ProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if settings have been modified
  const isDirty = originalSettings ? JSON.stringify(settings) !== JSON.stringify(originalSettings) : false;
  
  // Navigation guard to prevent losing unsaved changes
  const { confirmNavigation, NavigationGuard } = useFormNavigation({
    isDirty,
    isEnabled: true,
    entityType: 'template' as const // Use template as closest match for settings
  });
  const [showSecrets, setShowSecrets] = useState({
    google_client_secret: false,
    stripe_secret_key: false
  });

  useEffect(() => {
    loadSettings();
  }, []);

  // Expose saveSettings function to parent component
  useImperativeHandle(ref, () => ({
    saveSettings
  }));

  const loadSettings = async () => {
    try {
      // Use dynamic import to avoid circular dependencies
      const { sqliteService } = await import('@/services/sqlite.svc');
      
      if (!sqliteService.isReady()) {
        await sqliteService.initialize();
      }

      const projectSettings = await sqliteService.getProjectSettings();
      if (projectSettings) {
        setSettings(projectSettings);
        setOriginalSettings(projectSettings); // Store original for dirty checking
      }
    } catch (error) {
      console.error('Error loading project settings:', error);
      toast.error('Failed to load project settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleEnabled = (section: 'google_oauth' | 'stripe') => {
    setSettings(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [section]: {
          ...prev[section],
          enabled: !prev[section].enabled
        }
      };
    });
  };

  const handleInputChange = (section: keyof ProjectSettings, field: string, value: string | number | boolean) => {
    setSettings(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value
        }
      };
    });
  };

  const saveSettings = async () => {
    try {
      // Use dynamic import to avoid circular dependencies
      const { sqliteService } = await import('@/services/sqlite.svc');
      
      if (!sqliteService.isReady()) {
        await sqliteService.initialize();
      }

      await sqliteService.updateProjectSettings(settings);
      setOriginalSettings(settings); // Update original settings after successful save
      toast.success('Integration settings saved successfully');
    } catch (error) {
      console.error('Error saving project settings:', error);
      toast.error('Failed to save project settings');
    }
  };

  const toggleSecretVisibility = (key: keyof typeof showSecrets) => {
    setShowSecrets(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-muted rounded"></div>
            <div className="h-4 bg-muted rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <NavigationGuard />
      <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-card-foreground">Integration Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure integrations and features for your application. These settings override the default .env configuration.
        </p>
      </div>

      {/* Google OAuth Settings */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Globe className="h-5 w-5 text-primary mr-2" />
            <h4 className="text-md font-medium text-card-foreground">Google OAuth</h4>
            {settings?.google_oauth?.configured && (
              <CheckCircle className="h-4 w-4 text-green-500 ml-2" />
            )}
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.google_oauth?.enabled || false}
              onChange={() => handleToggleEnabled('google_oauth')}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {!settings?.google_oauth?.configured && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mr-2" />
              <p className="text-sm text-yellow-800">
                Google OAuth is not configured in your .env file. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <a
            href="https://developers.google.com/identity/protocols/oauth2"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            Google OAuth setup knowledge base
            <ExternalLink className="ml-1 h-4 w-4" />
          </a>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Client ID
            </label>
            <input
              type="text"
              value={settings?.google_oauth?.client_id || ''}
              onChange={(e) => handleInputChange('google_oauth', 'client_id', e.target.value)}
              placeholder="Your Google OAuth Client ID"
              className={themeClasses.input}
              disabled={!settings?.google_oauth?.enabled}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Client Secret
            </label>
            <div className="relative">
              <input
                type={showSecrets.google_client_secret ? 'text' : 'password'}
                value={settings?.google_oauth?.client_secret || ''}
                onChange={(e) => handleInputChange('google_oauth', 'client_secret', e.target.value)}
                placeholder="Your Google OAuth Client Secret"
                className={`${themeClasses.input} pr-10`}
                disabled={!settings?.google_oauth?.enabled}
              />
              <button
                type="button"
                onClick={() => toggleSecretVisibility('google_client_secret')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showSecrets.google_client_secret ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stripe Integration */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <CreditCard className="h-5 w-5 text-primary mr-2" />
            <h4 className="text-md font-medium text-card-foreground">Stripe Integration</h4>
            {settings?.stripe?.configured && (
              <CheckCircle className="h-4 w-4 text-green-500 ml-2" />
            )}
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.stripe?.enabled || false}
              onChange={() => handleToggleEnabled('stripe')}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div className="space-y-4">
          <a
            href="https://docs.stripe.com/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            Stripe integration setup knowledge base
            <ExternalLink className="ml-1 h-4 w-4" />
          </a>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Publishable Key
            </label>
            <input
              type="text"
              value={settings?.stripe?.publishable_key || ''}
              onChange={(e) => handleInputChange('stripe', 'publishable_key', e.target.value)}
              placeholder="pk_test_... or pk_live_..."
              className={themeClasses.input}
              disabled={!settings?.stripe?.enabled}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Secret Key
            </label>
            <div className="relative">
              <input
                type={showSecrets.stripe_secret_key ? 'text' : 'password'}
                value={settings?.stripe?.secret_key || ''}
                onChange={(e) => handleInputChange('stripe', 'secret_key', e.target.value)}
                placeholder="sk_test_... or sk_live_..."
                className={`${themeClasses.input} pr-10`}
                disabled={!settings?.stripe?.enabled}
              />
              <button
                type="button"
                onClick={() => toggleSecretVisibility('stripe_secret_key')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showSecrets.stripe_secret_key ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>
        </div>

        {!settings?.stripe?.enabled && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
            <p className="text-sm text-blue-800">
              Enable Stripe integration to accept payments. Visit the Stripe settings page to configure payment options once enabled.
            </p>
          </div>
        )}
      </div>


      {/* Email Setup */}
      <EmailSettings ref={emailSettingsRef} />

      {/* Security Settings */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-4">
          <Shield className="h-5 w-5 text-primary mr-2" />
          <h4 className="text-md font-medium text-card-foreground">Security Settings</h4>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-card-foreground">Require Email Verification</label>
              <p className="text-sm text-muted-foreground">Users must verify their email before accessing the application</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings?.security?.require_email_verification || false}
                onChange={(e) => handleInputChange('security', 'require_email_verification', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>



          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Max Failed Login Attempts
            </label>
            <input
              type="number"
              value={settings?.security?.max_failed_login_attempts || 5}
              onChange={(e) => handleInputChange('security', 'max_failed_login_attempts', parseInt(e.target.value))}
              min="1"
              max="10"
              className={themeClasses.input}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Account Lockout Duration (minutes)
            </label>
            <input
              type="number"
              value={Math.floor((settings?.security?.account_lockout_duration || 1800000) / 60000)}
              onChange={(e) => handleInputChange('security', 'account_lockout_duration', parseInt(e.target.value) * 60000)}
              min="1"
              max="1440"
              className={themeClasses.input}
            />
          </div>
        </div>
      </div>
      </div>
    </>
  );
});

ProjectSettingsTab.displayName = 'ProjectSettingsTab';
