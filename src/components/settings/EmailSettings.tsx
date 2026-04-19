import { useState, forwardRef, useImperativeHandle } from 'react';
import { Mail, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { themeClasses } from '@/utils/themeUtils.util';
import { useEmailSettings } from '@/hooks/useSettings.hook';
import { authenticatedFetch } from '@/utils/api';
import type { SettingsTabRef } from '../Settings';

export const EmailSettings = forwardRef<SettingsTabRef>((props, ref) => {
  const {
    settings,
    setSettings,
    saveSettings,
    isLoading,
    isSaving,
    isLoaded,
    error
  } = useEmailSettings();

  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'success' | 'error'>('unknown');
  const [showPassword, setShowPassword] = useState(false);

  // Expose saveSettings method to parent component
  useImperativeHandle(ref, () => ({
    saveSettings: async () => {
      try {
        await saveSettings();
      } catch (error) {
        console.error('Error saving email settings:', error);
        throw error;
      }
    }
  }), [saveSettings]);

  const handleInputChange = (field: keyof typeof settings, value: string | number | boolean) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));

    // Reset connection status when settings change
    if (connectionStatus !== 'unknown') {
      setConnectionStatus('unknown');
    }
  };

  const getProviderTestPayload = () => ({
    provider: settings.email_provider,
    isEnabled: settings.isEnabled,
    smtp_host: settings.smtp_host,
    smtp_port: settings.smtp_port,
    smtp_user: settings.smtp_user,
    smtp_password: settings.smtp_password,
    smtp_secure: settings.smtp_secure,
    sendgrid_api_key: settings.sendgrid_api_key,
    sendgrid_from: settings.sendgrid_from || settings.from_email,
    from_email: settings.from_email,
    from_name: settings.from_name
  });

  const validateProviderFields = () => {
    if (!settings.from_email) {
      return 'Please set a from email address';
    }

    if (settings.email_provider === 'sendgrid') {
      if (!settings.sendgrid_api_key) {
        return 'SendGrid API key is required';
      }
      if (!settings.sendgrid_from && !settings.from_email) {
        return 'SendGrid sender email is required';
      }
      return null;
    }

    if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_password) {
      return 'Please fill in required SMTP fields before testing';
    }
    return null;
  };

  const testConnection = async () => {
    const validationError = validateProviderFields();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('unknown');

    try {
      // Save settings first
      await saveSettings();
      const response = await authenticatedFetch('/api/settings/email/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          settings: getProviderTestPayload()
        })
      });
      const testResult = await response.json();
      
      if (testResult.success) {
        setConnectionStatus('success');
        toast.success('Email provider connection test successful!');
      } else {
        setConnectionStatus('error');
        toast.error(`Connection test failed: ${testResult.message}`);
      }
    } catch (error) {
      setConnectionStatus('error');
      toast.error('Connection test failed: ' + error);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const sendTestEmail = async () => {
    const validationError = validateProviderFields();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      await saveSettings();
      const response = await authenticatedFetch('/api/settings/email/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          settings: getProviderTestPayload(),
          testEmail: settings.from_email
        })
      });
      const result = await response.json();

      if (result.success) {
        toast.success('Test email sent successfully!');
      } else {
        toast.error(`Failed to send test email: ${result.message}`);
      }
    } catch (error) {
      toast.error('Failed to send test email: ' + error);
    }
  };

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'success':
        return 'Connection successful';
      case 'error':
        return 'Connection failed';
      default:
        return 'Not tested';
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Mail className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Email Configuration</h3>
        </div>
        <div className="flex justify-center py-8">
          <div className="text-muted-foreground">Loading email settings...</div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Mail className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Email Configuration</h3>
        </div>
        <div className="text-center py-8">
          <div className="text-destructive mb-2">Error loading settings</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Email Configuration */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Mail className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Email Configuration</h3>
        </div>

        <div className="space-y-6">
          {/* Enable/Disable Email */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <h4 className="text-sm font-medium text-card-foreground">Enable Email Sending</h4>
              <p className="text-sm text-muted-foreground">Allow the application to send emails for invoices, reminders, and client communications</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.isEnabled}
                onChange={(e) => handleInputChange('isEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Connection Status */}
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center">
              {getConnectionStatusIcon()}
              <span className="ml-2 text-sm font-medium text-card-foreground">
                {getConnectionStatusText()}
              </span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={testConnection}
                disabled={isTestingConnection || !settings.isEnabled}
                className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTestingConnection ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                onClick={sendTestEmail}
                disabled={!settings.isEnabled || connectionStatus !== 'success'}
                className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send Test Email
              </button>
            </div>
          </div>

          {/* SMTP Server Settings */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Email Provider
            </label>
            <select
              value={settings.email_provider}
              onChange={(e) => handleInputChange('email_provider', e.target.value)}
              className={themeClasses.select}
            >
              <option value="smtp">SMTP</option>
              <option value="sendgrid">SendGrid</option>
            </select>
          </div>

          {settings.email_provider === 'smtp' ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    SMTP Host *
                  </label>
                  <input
                    type="text"
                    value={settings.smtp_host}
                    onChange={(e) => handleInputChange('smtp_host', e.target.value)}
                    placeholder="smtp.gmail.com"
                    className={themeClasses.input}
                    disabled={!settings.isEnabled}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    SMTP Port *
                  </label>
                  <input
                    type="number"
                    value={settings.smtp_port}
                    onChange={(e) => handleInputChange('smtp_port', parseInt(e.target.value) || 587)}
                    placeholder="587"
                    className={themeClasses.input}
                    disabled={!settings.isEnabled}
                  />
                </div>
              </div>

              {/* Security Settings */}
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.smtp_secure}
                    onChange={(e) => handleInputChange('smtp_secure', e.target.checked)}
                    disabled={!settings.isEnabled}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-muted-foreground">Use SSL/TLS Security</span>
                </label>
              </div>

              {/* Authentication */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Username *
                  </label>
                  <input
                    type="text"
                    value={settings.smtp_user}
                    onChange={(e) => handleInputChange('smtp_user', e.target.value)}
                    placeholder="your-email@gmail.com"
                    className={themeClasses.input}
                    disabled={!settings.isEnabled}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={settings.smtp_password}
                      onChange={(e) => handleInputChange('smtp_password', e.target.value)}
                      placeholder="App password or account password"
                      className={themeClasses.input}
                      disabled={!settings.isEnabled}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                      disabled={!settings.isEnabled}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  SendGrid API Key *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={settings.sendgrid_api_key}
                    onChange={(e) => handleInputChange('sendgrid_api_key', e.target.value)}
                    placeholder="SG.xxxxx"
                    className={themeClasses.input}
                    disabled={!settings.isEnabled}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                    disabled={!settings.isEnabled}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  SendGrid Sender Email *
                </label>
                <input
                  type="email"
                  value={settings.sendgrid_from}
                  onChange={(e) => handleInputChange('sendgrid_from', e.target.value)}
                  placeholder="verified-sender@yourdomain.com"
                  className={themeClasses.input}
                  disabled={!settings.isEnabled}
                />
              </div>
            </div>
          )}

          {/* Email Identity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                From Email *
              </label>
              <input
                type="email"
                value={settings.from_email}
                onChange={(e) => handleInputChange('from_email', e.target.value)}
                placeholder="invoices@yourcompany.com"
                className={themeClasses.input}
                disabled={!settings.isEnabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                From Name
              </label>
              <input
                type="text"
                value={settings.from_name}
                onChange={(e) => handleInputChange('from_name', e.target.value)}
                placeholder="Your Company Name"
                className={themeClasses.input}
                disabled={!settings.isEnabled}
              />
            </div>
          </div>



        </div>
      </div>

      {/* Help Section */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h4 className="text-sm font-medium text-card-foreground mb-3">Common SMTP Settings</h4>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div>
            <strong>Gmail:</strong> smtp.gmail.com, Port 587 (TLS) or 465 (SSL)
            <br />
            <em>Note: Use App Password instead of regular password</em>
          </div>
          <div>
            <strong>Outlook/Hotmail:</strong> smtp-mail.outlook.com, Port 587 (TLS)
          </div>
          <div>
            <strong>Yahoo:</strong> smtp.mail.yahoo.com, Port 587 (TLS) or 465 (SSL)
          </div>
          <div>
            <strong>SendGrid SMTP:</strong> smtp.sendgrid.net, Port 587 (TLS)
            <br />
            <strong>SendGrid API:</strong> Select provider "SendGrid" and use your API key + verified sender.
          </div>
        </div>
      </div>
    </div>
  );
});

EmailSettings.displayName = 'EmailSettings';
