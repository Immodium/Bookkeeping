import React, { useState } from 'react';
import { Edit, Trash2, Calendar, RefreshCw, Mail } from 'lucide-react';
import { Retainer, RetainerStatus } from '@/types';
import { getStatusColor } from '@/utils/themeUtils.util';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import { formatDateSync } from '@/components/ui/FormattedDate';
import { authenticatedFetch } from '@/utils/api';
import { toast } from 'sonner';

interface RetainersListProps {
  retainers: Retainer[];
  onEditRetainer: (retainer: Retainer) => void;
  onDeleteRetainer: (id: number) => void;
  onViewRetainer?: (retainer: Retainer) => void;
}

const toStatusLabel = (status: RetainerStatus): string => {
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const toBillingCycleLabel = (billingCycle: Retainer['billing_cycle']): string => {
  return billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1);
};

export const RetainersList: React.FC<RetainersListProps> = ({
  retainers,
  onEditRetainer,
  onDeleteRetainer,
  onViewRetainer
}) => {
  const [sendingEmailId, setSendingEmailId] = useState<number | null>(null);

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete retainer "${name}"?`)) {
      onDeleteRetainer(id);
    }
  };

  const handleSendEmail = async (event: React.MouseEvent, retainer: Retainer) => {
    event.stopPropagation();
    const toEmail = retainer.client_email;
    if (!toEmail) {
      toast.error('No email address on file for this client');
      return;
    }
    setSendingEmailId(retainer.id);
    try {
      const response = await authenticatedFetch(`/api/retainers/${retainer.id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toEmail })
      });
      const result = await response.json();
      if (result.success) {
        toast.success(`Retainer emailed to ${toEmail}`);
      } else {
        toast.error(`Failed to send: ${result.message}`);
      }
    } catch {
      toast.error('Failed to send retainer email');
    } finally {
      setSendingEmailId(null);
    }
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Retainer
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Client
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Amount
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Billing Cycle
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Next Invoice
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Auto Renew
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {retainers.map((retainer) => (
              <tr
                key={retainer.id}
                className="hover:bg-muted/50 cursor-pointer"
                onClick={() => onViewRetainer?.(retainer)}
              >
                <td className="py-4 px-6">
                  <div>
                    <div className="text-sm font-medium text-foreground">{retainer.name}</div>
                    {retainer.description && (
                      <div className="text-sm text-muted-foreground truncate max-w-xs">
                        {retainer.description}
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-4 px-6 text-sm text-foreground">
                  {retainer.client_name || `Client #${retainer.client_id}`}
                </td>
                <td className="py-4 px-6 text-sm font-medium text-foreground">
                  <FormattedCurrency amount={retainer.amount} />
                </td>
                <td className="py-4 px-6">
                  <span className="inline-flex items-center text-sm text-foreground">
                    <RefreshCw className="h-4 w-4 mr-2 text-muted-foreground" />
                    {toBillingCycleLabel(retainer.billing_cycle)}
                  </span>
                </td>
                <td className="py-4 px-6">
                  <span className="inline-flex items-center text-sm text-foreground">
                    <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                    {formatDateSync(retainer.next_invoice_date)}
                  </span>
                </td>
                <td className="py-4 px-6">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(retainer.status)}`}>
                    {toStatusLabel(retainer.status)}
                  </span>
                </td>
                <td className="py-4 px-6 text-sm text-foreground">
                  {retainer.auto_renew ? 'Yes' : 'No'}
                </td>
                <td className="py-4 px-6">
                  <div className="flex space-x-2">
                    {retainer.client_email && (
                      <button
                        onClick={(event) => handleSendEmail(event, retainer)}
                        onMouseDown={(event) => event.stopPropagation()}
                        disabled={sendingEmailId === retainer.id}
                        className="p-1 text-muted-foreground hover:text-blue-600 disabled:opacity-50"
                        title="Email retainer"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditRetainer(retainer);
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      className="p-1 text-muted-foreground hover:text-blue-600"
                      title="Edit retainer"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(retainer.id, retainer.name);
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      className="p-1 text-muted-foreground hover:text-red-600"
                      title="Delete retainer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
