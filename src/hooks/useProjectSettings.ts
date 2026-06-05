import { useState, useEffect } from 'react';
import { sqliteService } from '@/services/sqlite.svc';
import { ProjectSettings } from '@/types';

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  email: {
    enabled: false,
    provider: 'smtp',
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    email_from: '',
    resend_configured: false,
    configured: false
  },
  security: {
    require_email_verification: true,
    max_failed_login_attempts: 5,
    account_lockout_duration: 1800000
  }
};

const mapProjectSettings = (value: unknown): ProjectSettings => {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid project settings format');
  }

  const typedSettings = value as Record<string, any>;
  return {
    email: {
      enabled: Boolean(typedSettings.email?.enabled),
      provider: typedSettings.email?.provider === 'resend' ? 'resend' : 'smtp',
      smtp_host: String(typedSettings.email?.smtp_host || ''),
      smtp_port: Number(typedSettings.email?.smtp_port) || 587,
      smtp_user: String(typedSettings.email?.smtp_user || ''),
      email_from: String(typedSettings.email?.email_from || ''),
      resend_configured: Boolean(typedSettings.email?.resend_configured),
      configured: Boolean(typedSettings.email?.configured)
    },
    security: {
      require_email_verification: Boolean(typedSettings.security?.require_email_verification ?? true),
      max_failed_login_attempts: Number(typedSettings.security?.max_failed_login_attempts) || 5,
      account_lockout_duration: Number(typedSettings.security?.account_lockout_duration) || 1800000
    }
  };
};

export const useProjectSettings = () => {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Remove redundant initialization - getProjectSettings will handle it
        const projectSettings = await sqliteService.getProjectSettings();
        
        setSettings(mapProjectSettings(projectSettings));
      } catch (err) {
        console.error('Error loading project settings:', err);
        setError(err instanceof Error ? err.message : 'Failed to load project settings');
        
        // Set default settings if loading fails
        setSettings(DEFAULT_PROJECT_SETTINGS);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const refreshSettings = async () => {
    try {
      // Remove redundant initialization - getProjectSettings will handle it
      const projectSettings = await sqliteService.getProjectSettings();
      
      setSettings(mapProjectSettings(projectSettings));
      setError(null);
    } catch (err) {
      console.error('Error refreshing project settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh project settings');
    }
  };

  return {
    settings,
    isLoading,
    error,
    refreshSettings
  };
};
