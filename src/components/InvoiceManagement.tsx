
import { useState, useEffect } from 'react';
import { InvoicesTab } from './invoices/InvoicesTab';
import { TemplatesTab } from './invoices/TemplatesTab';
import { EditInvoicePage } from './invoices/EditInvoicePage';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { themeClasses } from '@/utils/themeUtils.util';

export const InvoiceManagement = () => {
  const [activeTab, setActiveTab] = useState('invoices');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = location.hash.replace('#', '');
    const pathname = location.pathname;

    // Check if we're on an edit route
    if (pathname.includes('/invoices/edit/')) {
      setActiveTab('edit');
    } else if (hash === 'templates') {
      setActiveTab('templates');
    } else {
      // Default to invoices tab, and set hash if not present
      setActiveTab('invoices');
      if (pathname === '/invoices' && !hash) {
        window.history.replaceState(null, '', '/invoices#invoices');
      }
    }
  }, [location.hash, location.pathname]);

  const handleTabChange = (tab: string) => {
    if (tab === 'invoices') {
      navigate('/invoices#invoices');
    } else if (tab === 'templates') {
      navigate('/invoices#templates');
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'templates':
        return 'Recurring Templates';
      case 'edit':
        return 'Edit Invoice';
      default:
        return 'Sent Invoices';
    }
  };

  const getPageSubtitle = () => {
    switch (activeTab) {
      case 'templates':
        return 'Manage your recurring invoice templates';
      case 'edit':
        return 'Update invoice details';
      default:
        return 'Manage your invoices and track payments';
    }
  };

  return (
    <div className={themeClasses.page}>
      <div className={themeClasses.pageContainer}>
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className={themeClasses.pageTitle}>{getPageTitle()}</h1>
              <p className={themeClasses.pageSubtitle}>{getPageSubtitle()}</p>
            </div>
            {/* Action Button */}
            {activeTab === 'invoices' && (
              <button
                onClick={() => navigate('/invoices/create')}
                className="flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Invoice
              </button>
            )}
            {activeTab === 'templates' && (
              <button
                onClick={() => navigate('/recurring-invoices/create')}
                className="flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </button>
            )}
          </div>

          {/* Tab Navigation - only show for invoices and templates, not edit */}
          {activeTab !== 'edit' && (
            <div className="border-b border-border">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => handleTabChange('invoices')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'invoices'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  Sent Invoices
                </button>
                <button
                  onClick={() => handleTabChange('templates')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'templates'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  Recurring Templates
                </button>
              </nav>
            </div>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'invoices' && <InvoicesTab />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'edit' && <EditInvoicePage />}
      </div>
    </div>
  );
};
