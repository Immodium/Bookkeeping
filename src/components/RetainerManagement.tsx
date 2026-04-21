import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Repeat,
  DollarSign,
  Calendar,
  PauseCircle,
  XCircle,
  PlayCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/utils/api';
import { DateRangeFilter } from './ui/DateRangeFilter';
import { PaginationControls } from './ui/PaginationControls';
import { RetainersList } from './retainers/RetainersList';
import { usePagination } from '@/hooks/usePagination';
import { filterByDateRange, getDateRangeForPeriod } from '@/utils/data';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import { themeClasses, getButtonClasses, getIconColorClasses } from '@/utils/themeUtils.util';
import { Client, DateRange, Retainer, RetainerBillingCycle, RetainerFormData, RetainerStatus, TimePeriod } from '@/types';

type RetainerStats = {
  summary: {
    total: number;
    active: number;
    paused: number;
    ended: number;
    total_amount: number;
    monthly_value: number;
  };
  upcoming_next_30_days: number;
};

const DEFAULT_STATS: RetainerStats = {
  summary: {
    total: 0,
    active: 0,
    paused: 0,
    ended: 0,
    total_amount: 0,
    monthly_value: 0
  },
  upcoming_next_30_days: 0
};

const BILLING_CYCLE_LABELS: Record<RetainerBillingCycle, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly'
};

interface RetainerFormProps {
  retainer: Retainer | null;
  clients: Client[];
  onSave: (retainerData: RetainerFormData) => Promise<void>;
  onCancel: () => void;
}

const RetainerForm: React.FC<RetainerFormProps> = ({ retainer, clients, onSave, onCancel }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<RetainerFormData>({
    client_id: retainer?.client_id || 0,
    name: retainer?.name || '',
    description: retainer?.description || '',
    amount: retainer?.amount || 0,
    currency: retainer?.currency || 'USD',
    billing_cycle: retainer?.billing_cycle || 'monthly',
    start_date: retainer?.start_date || new Date().toISOString().split('T')[0],
    next_invoice_date: retainer?.next_invoice_date || new Date().toISOString().split('T')[0],
    end_date: retainer?.end_date || '',
    status: retainer?.status || 'active',
    auto_renew: retainer ? retainer.auto_renew === 1 : true,
    notes: retainer?.notes || ''
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.client_id) {
      toast.error('Please select a client');
      return;
    }
    if (formData.amount <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save retainer';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={themeClasses.page}>
      <div className={themeClasses.pageContainer}>
        <div className="max-w-3xl mx-auto">
          <div className={themeClasses.sectionHeader}>
            <h1 className={themeClasses.sectionTitle}>{retainer ? 'Edit Retainer' : 'Add New Retainer'}</h1>
          </div>
          <div className={themeClasses.card}>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={themeClasses.label}>Client *</label>
                  <select
                    required
                    className={themeClasses.select}
                    value={formData.client_id}
                    onChange={(event) => setFormData((prev) => ({ ...prev, client_id: parseInt(event.target.value, 10) || 0 }))}
                  >
                    <option value={0}>Select a client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={themeClasses.label}>Retainer Name *</label>
                  <input
                    required
                    type="text"
                    className={themeClasses.input}
                    value={formData.name}
                    onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="e.g. Website maintenance retainer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className={themeClasses.label}>Amount *</label>
                  <input
                    required
                    min={0}
                    step="0.01"
                    type="number"
                    className={themeClasses.input}
                    value={formData.amount}
                    onChange={(event) => setFormData((prev) => ({ ...prev, amount: Number(event.target.value) }))}
                  />
                </div>
                <div>
                  <label className={themeClasses.label}>Billing Cycle *</label>
                  <select
                    className={themeClasses.select}
                    value={formData.billing_cycle}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, billing_cycle: event.target.value as RetainerBillingCycle }))
                    }
                  >
                    {Object.entries(BILLING_CYCLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={themeClasses.label}>Status *</label>
                  <select
                    className={themeClasses.select}
                    value={formData.status}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, status: event.target.value as RetainerStatus }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="ended">Ended</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className={themeClasses.label}>Start Date *</label>
                  <input
                    required
                    type="date"
                    className={themeClasses.dateInput}
                    value={formData.start_date}
                    onChange={(event) => setFormData((prev) => ({ ...prev, start_date: event.target.value }))}
                  />
                </div>
                <div>
                  <label className={themeClasses.label}>Next Invoice Date *</label>
                  <input
                    required
                    type="date"
                    className={themeClasses.dateInput}
                    value={formData.next_invoice_date}
                    onChange={(event) => setFormData((prev) => ({ ...prev, next_invoice_date: event.target.value }))}
                  />
                </div>
                <div>
                  <label className={themeClasses.label}>End Date</label>
                  <input
                    type="date"
                    className={themeClasses.dateInput}
                    value={formData.end_date}
                    onChange={(event) => setFormData((prev) => ({ ...prev, end_date: event.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className={themeClasses.label}>Description</label>
                <textarea
                  rows={3}
                  className={themeClasses.textarea}
                  value={formData.description}
                  onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Describe what is covered in this retainer"
                />
              </div>

              <div>
                <label className={themeClasses.label}>Notes</label>
                <textarea
                  rows={3}
                  className={themeClasses.textarea}
                  value={formData.notes}
                  onChange={(event) => setFormData((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Internal notes"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="retainer-auto-renew"
                  type="checkbox"
                  checked={formData.auto_renew}
                  onChange={(event) => setFormData((prev) => ({ ...prev, auto_renew: event.target.checked }))}
                  className="rounded border-border"
                />
                <label htmlFor="retainer-auto-renew" className="text-sm text-foreground">
                  Automatically renew this retainer
                </label>
              </div>

              <div className="flex justify-end space-x-4">
                <button type="button" onClick={onCancel} className={getButtonClasses('secondary')}>
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className={getButtonClasses('primary')}>
                  {isSaving ? 'Saving...' : retainer ? 'Update Retainer' : 'Save Retainer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export const RetainerManagement: React.FC = () => {
  const [retainers, setRetainers] = useState<Retainer[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [stats, setStats] = useState<RetainerStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRetainer, setEditingRetainer] = useState<Retainer | null>(null);

  const [filters, setFilters] = useState({
    searchTerm: '',
    statusFilter: 'all',
    billingCycleFilter: 'all',
    dateFilter: 'this-month' as TimePeriod,
    customDateRange: undefined as DateRange | undefined
  });

  useEffect(() => {
    void loadRetainers();
    void loadClients();
    void loadStats();
  }, []);

  const loadRetainers = async () => {
    try {
      setLoading(true);
      const response = await authenticatedFetch('/api/retainers?limit=200');
      const data = await response.json();
      if (data.success) {
        setRetainers(data.data?.retainers || []);
      } else {
        throw new Error(data.error || 'Failed to load retainers');
      }
    } catch (error) {
      toast.error('Failed to load retainers');
      setRetainers([]);
    } finally {
      setLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      const response = await authenticatedFetch('/api/clients');
      const data = await response.json();
      if (data.success) {
        setClients(data.data || []);
      }
    } catch (error) {
      setClients([]);
    }
  };

  const loadStats = async () => {
    try {
      const response = await authenticatedFetch('/api/retainers/stats');
      const data = await response.json();
      if (data.success) {
        setStats(data.data || DEFAULT_STATS);
      }
    } catch (error) {
      setStats(DEFAULT_STATS);
    }
  };

  const handleSaveRetainer = async (retainerData: RetainerFormData) => {
    const path = editingRetainer ? `/api/retainers/${editingRetainer.id}` : '/api/retainers';
    const method = editingRetainer ? 'PUT' : 'POST';
    const payload = {
      retainerData: {
        ...retainerData,
        end_date: retainerData.end_date || undefined
      }
    };

    const response = await authenticatedFetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to save retainer');
    }

    toast.success(editingRetainer ? 'Retainer updated successfully' : 'Retainer created successfully');
    setShowForm(false);
    setEditingRetainer(null);
    await Promise.all([loadRetainers(), loadStats()]);
  };

  const handleDeleteRetainer = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this retainer?')) {
      return;
    }

    try {
      const response = await authenticatedFetch(`/api/retainers/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete retainer');
      }
      toast.success('Retainer deleted successfully');
      await Promise.all([loadRetainers(), loadStats()]);
    } catch (error) {
      toast.error('Failed to delete retainer');
    }
  };

  const handleDateFilterChange = (period: TimePeriod, customRange?: DateRange) => {
    setFilters((prev) => ({ ...prev, dateFilter: period, customDateRange: customRange }));
  };

  const filteredRetainers = retainers.filter((retainer) => {
    const matchesSearch =
      retainer.name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      (retainer.client_name || '').toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      (retainer.description || '').toLowerCase().includes(filters.searchTerm.toLowerCase());
    const matchesStatus = filters.statusFilter === 'all' || retainer.status === filters.statusFilter;
    const matchesBillingCycle = filters.billingCycleFilter === 'all' || retainer.billing_cycle === filters.billingCycleFilter;
    return matchesSearch && matchesStatus && matchesBillingCycle;
  });

  const dateFilteredRetainers = (() => {
    if (filters.dateFilter === 'custom' && filters.customDateRange) {
      return filterByDateRange(filteredRetainers, filters.customDateRange, 'next_invoice_date');
    }
    const dateRange = getDateRangeForPeriod(filters.dateFilter);
    return filterByDateRange(filteredRetainers, dateRange, 'next_invoice_date');
  })();

  const pagination = usePagination({
    data: dateFilteredRetainers,
    searchTerm: filters.searchTerm,
    filters: {
      statusFilter: filters.statusFilter,
      billingCycleFilter: filters.billingCycleFilter,
      dateFilter: filters.dateFilter
    }
  });

  if (showForm) {
    return (
      <RetainerForm
        retainer={editingRetainer}
        clients={clients}
        onSave={handleSaveRetainer}
        onCancel={() => {
          setShowForm(false);
          setEditingRetainer(null);
        }}
      />
    );
  }

  return (
    <div className={themeClasses.page}>
      <div className={themeClasses.pageContainer}>
        <div className={themeClasses.sectionHeader}>
          <div>
            <h1 className={themeClasses.sectionTitle}>Retainers</h1>
            <p className={themeClasses.sectionSubtitle}>Set up and manage ongoing client retainers</p>
          </div>
          <button
            onClick={() => {
              setEditingRetainer(null);
              setShowForm(true);
            }}
            className={getButtonClasses('primary')}
          >
            <Plus className={themeClasses.iconButton} />
            Add Retainer
          </button>
        </div>

        <div className={themeClasses.statsGrid}>
          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Active Retainers</p>
                <p className={themeClasses.statValueSmall}>{stats.summary.active}</p>
              </div>
              <PlayCircle className={`${themeClasses.iconLarge} ${getIconColorClasses('green')}`} />
            </div>
          </div>
          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Paused</p>
                <p className={themeClasses.statValueSmall}>{stats.summary.paused}</p>
              </div>
              <PauseCircle className={`${themeClasses.iconLarge} ${getIconColorClasses('yellow')}`} />
            </div>
          </div>
          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Monthly Value</p>
                <p className={themeClasses.statValueSmall}>
                  <FormattedCurrency amount={stats.summary.monthly_value} />
                </p>
              </div>
              <DollarSign className={`${themeClasses.iconLarge} ${getIconColorClasses('blue')}`} />
            </div>
          </div>
          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Due in Next 30 Days</p>
                <p className={themeClasses.statValueSmall}>{stats.upcoming_next_30_days}</p>
              </div>
              <Calendar className={`${themeClasses.iconLarge} ${getIconColorClasses('purple')}`} />
            </div>
          </div>
        </div>

        <div className={themeClasses.searchContainer}>
          <div className="flex justify-between items-center">
            <div className="flex space-x-4 flex-1 mr-6">
              <div className={themeClasses.searchWrapper}>
                <Search className={themeClasses.searchIcon} />
                <input
                  type="text"
                  placeholder="Search retainers..."
                  className={themeClasses.searchInput}
                  value={filters.searchTerm}
                  onChange={(event) => setFilters((prev) => ({ ...prev, searchTerm: event.target.value }))}
                />
              </div>
              <select
                className={themeClasses.select}
                value={filters.statusFilter}
                onChange={(event) => setFilters((prev) => ({ ...prev, statusFilter: event.target.value }))}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="ended">Ended</option>
              </select>
              <select
                className={themeClasses.select}
                value={filters.billingCycleFilter}
                onChange={(event) => setFilters((prev) => ({ ...prev, billingCycleFilter: event.target.value }))}
              >
                <option value="all">All Billing Cycles</option>
                {Object.entries(BILLING_CYCLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <DateRangeFilter
                value={filters.dateFilter}
                customRange={filters.customDateRange}
                onChange={handleDateFilterChange}
                className="max-w-xs"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className={themeClasses.card}>
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading retainers...</p>
            </div>
          </div>
        ) : (
          <RetainersList
            retainers={pagination.paginatedData}
            onEditRetainer={(retainer) => {
              setEditingRetainer(retainer);
              setShowForm(true);
            }}
            onDeleteRetainer={handleDeleteRetainer}
            onViewRetainer={(retainer) => {
              setEditingRetainer(retainer);
              setShowForm(true);
            }}
          />
        )}

        <PaginationControls
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          itemsPerPage={pagination.itemsPerPage}
          totalItems={pagination.totalItems}
          displayStart={pagination.displayStart}
          displayEnd={pagination.displayEnd}
          pageNumbers={pagination.pageNumbers}
          paginationSettings={pagination.paginationSettings}
          onPageChange={pagination.setCurrentPage}
          onItemsPerPageChange={pagination.setItemsPerPage}
          onNextPage={pagination.goToNextPage}
          onPrevPage={pagination.goToPrevPage}
          canGoNext={pagination.canGoNext}
          canGoPrev={pagination.canGoPrev}
          className="mt-6"
          itemType="retainers"
        />

        {!loading && dateFilteredRetainers.length === 0 && (
          <div className={themeClasses.card}>
            <div className="text-center">
              <Repeat className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No retainers found</h3>
              <p className="text-muted-foreground">
                Add your first ongoing retainer to start tracking recurring client work.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
