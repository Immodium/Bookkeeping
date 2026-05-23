import { Mail, CheckCircle } from 'lucide-react';

export const EmailSettings = () => {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      <div className="flex items-center mb-4">
        <Mail className="h-5 w-5 text-primary mr-2" />
        <h4 className="text-md font-medium text-card-foreground">Email</h4>
        <CheckCircle className="h-4 w-4 text-green-500 ml-2" />
      </div>
      <div className="flex items-start space-x-3 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-green-800 dark:text-green-200">Resend is active</p>
          <p className="text-sm text-green-700 dark:text-green-300 mt-1">
            Transactional emails (invites, password resets, invoices, retainers, reports) are sent
            via Resend from <span className="font-mono">no-reply@slimbooks.io</span>. No configuration required.
          </p>
        </div>
      </div>
    </div>
  );
};

EmailSettings.displayName = 'EmailSettings';
