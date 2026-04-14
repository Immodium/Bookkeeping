
import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { DashboardOverview } from '@/components/DashboardOverview';
import { ClientManagement } from '@/components/ClientManagement';
import { InvoiceManagement } from '@/components/InvoiceManagement';
import { Settings } from '@/components/Settings';

const Index = () => {
  const [activeSection, setActiveSection] = useState('dashboard');

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardOverview />;
      case 'clients':
        return <ClientManagement />;
      case 'invoices':
        return <InvoiceManagement />;
      case 'settings':
        return <Settings />;
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 lg:ml-64">
        <div className="p-6">
          {renderActiveSection()}
        </div>
      </main>
    </div>
  );
};

export default Index;
