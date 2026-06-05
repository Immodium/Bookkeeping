import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Shield } from 'lucide-react';
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
    email: {
      enabled: true,
      provider: 'resend',
      smtp_host: '',
      smtp_port: 587,
      smtp_user: '',
      email_from: '',
      resend_configured: true,
      configured: true
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

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setSettings(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        security: {
          ...prev.security,
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
      toast.success('Project settings saved successfully');
    } catch (error) {
      console.error('Error saving project settings:', error);
      toast.error('Failed to save project settings');
    }
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
        <h3 className="text-lg font-medium text-card-foreground">Project Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure email delivery and tenant security defaults.
        </p>
      </div>

      {/* Email Setup */}
      <EmailSettings />

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
                onChange={(e) => handleInputChange('require_email_verification', e.target.checked)}
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
                onChange={(e) => handleInputChange('max_failed_login_attempts', parseInt(e.target.value))}
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
                onChange={(e) => handleInputChange('account_lockout_duration', parseInt(e.target.value) * 60000)}
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
