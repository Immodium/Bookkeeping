
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Upload, X, Receipt, Loader2 } from 'lucide-react';
import { useFormNavigation } from '@/hooks/useFormNavigation';
import { themeClasses, getButtonClasses } from '@/utils/themeUtils.util';
import { Expense, ExpenseFormData } from '@/types';
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES } from '@/types/constants/enums.types';
import { ExpenseFormProps } from '@/types/components/expense.types';
import { authenticatedFetch } from '@/utils/api';
import { toast } from 'sonner';

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ expense, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    date: expense?.date || new Date().toISOString().split('T')[0],
    vendor: expense?.vendor || '',
    category: expense?.category || 'Office Supplies',
    amount: expense?.amount?.toString() || '',
    description: expense?.description || '',
    receipt_url: expense?.receipt_url || '',
    is_billable: expense?.is_billable ?? false,
    status: expense?.status || 'pending' as const
  });

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [originalFormData, setOriginalFormData] = useState<any>(null);
  const [isOCRProcessing, setIsOCRProcessing] = useState(false);
  const [isAttachmentUploading, setIsAttachmentUploading] = useState(false);

  // Track if form has been modified
  const isDirty = originalFormData ? JSON.stringify(formData) !== JSON.stringify(originalFormData) : false;
  
  const { confirmNavigation, NavigationGuard } = useFormNavigation({
    isDirty,
    isEnabled: true,
    entityType: 'expense',
    onCancel
  });

  const handleCancel = () => {
    if (!isDirty) {
      onCancel();
      return;
    }

    // Show confirmation dialog if form is dirty
    confirmNavigation('cancel');
  };

  useEffect(() => {
    const initialData = {
      date: expense?.date || new Date().toISOString().split('T')[0],
      vendor: expense?.vendor || '',
      category: expense?.category || 'Office Supplies',
      amount: expense?.amount?.toString() || '',
      description: expense?.description || '',
      receipt_url: expense?.receipt_url || '',
      is_billable: expense?.is_billable ?? false,
      status: expense?.status || 'pending' as const
    };
    setOriginalFormData(initialData);
  }, [expense]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const expenseData = {
      date: formData.date,
      vendor: formData.vendor,
      category: formData.category,
      amount: parseFloat(formData.amount),
      description: formData.description,
      receipt_url: formData.receipt_url,
      is_billable: formData.is_billable,
      status: formData.status
    };
    
    onSave(expenseData);
  };

  const handleReceiptUploadWithOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isOCRProcessing) {
      return;
    }

    setReceiptFile(file);
    setIsOCRProcessing(true);

    try {
      const uploadData = new FormData();
      uploadData.append('receipt', file);

      const response = await authenticatedFetch('/api/expenses/receipt-ocr', {
        method: 'POST',
        body: uploadData,
        headers: {}
      });
      const payload = await response.json();
      const parsed = payload?.data || {};
      const normalizedAmountRaw = parsed.amount ?? parsed.total ?? parsed.total_amount;
      const normalizedAmount = Number.parseFloat(String(normalizedAmountRaw ?? ''));
      const hasAmount = Number.isFinite(normalizedAmount) && normalizedAmount > 0;

      setFormData((prev) => ({
        ...prev,
        date: parsed.date || prev.date,
        vendor: parsed.vendor || prev.vendor,
        category: parsed.category || prev.category,
        amount: hasAmount ? normalizedAmount.toFixed(2) : prev.amount,
        description: parsed.description || prev.description,
        receipt_url: parsed.receipt_url || prev.receipt_url
      }));

      toast.success('Receipt processed and expense fields auto-filled');
    } catch (error) {
      console.error('Receipt OCR failed:', error);
      toast.error('Failed to process receipt. Please fill details manually.');
    } finally {
      setIsOCRProcessing(false);
      e.target.value = '';
    }
  };

  const handleReceiptUploadWithoutOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isAttachmentUploading) {
      return;
    }

    setReceiptFile(file);
    setIsAttachmentUploading(true);

    try {
      const uploadData = new FormData();
      uploadData.append('receipt', file);

      const response = await authenticatedFetch('/api/expenses/receipt-upload', {
        method: 'POST',
        body: uploadData,
        headers: {}
      });
      const payload = await response.json();
      const uploaded = payload?.data || {};

      if (!uploaded.receipt_url) {
        throw new Error('Upload succeeded but no receipt URL was returned');
      }

      setFormData((prev) => ({
        ...prev,
        receipt_url: uploaded.receipt_url
      }));

      toast.success('Receipt attached successfully');
    } catch (error) {
      console.error('Manual receipt upload failed:', error);
      toast.error('Failed to attach receipt document.');
    } finally {
      setIsAttachmentUploading(false);
      e.target.value = '';
    }
  };

  const getReceiptFileName = (): string => {
    if (receiptFile?.name) {
      return receiptFile.name;
    }

    if (!formData.receipt_url) {
      return 'Receipt uploaded';
    }

    const fileName = formData.receipt_url.split('/').pop();
    return fileName ? decodeURIComponent(fileName) : 'Receipt uploaded';
  };

  const getReceiptViewerUrl = (): string => {
    if (!formData.receipt_url) return '';
    return formData.receipt_url.startsWith('http')
      ? formData.receipt_url
      : `${window.location.origin}${formData.receipt_url}`;
  };

  const removeReceipt = () => {
    setReceiptFile(null);
    setFormData({ ...formData, receipt_url: '' });
  };

  return (
    <div className={themeClasses.page}>
      <div className={themeClasses.pageContainer}>
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className={themeClasses.sectionHeader}>
            <button
              onClick={handleCancel}
              className="flex items-center text-muted-foreground hover:text-foreground mr-4"
            >
              <ArrowLeft className="h-5 w-5 mr-1" />
              Back
            </button>
            <h1 className={themeClasses.sectionTitle}>
              {expense ? 'Edit Expense' : 'Add New Expense'}
            </h1>
          </div>

          {/* Form */}
          <div className={themeClasses.card}>
            <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={themeClasses.label}>
                  Date *
                </label>
                <input
                  type="date"
                  required
                  className={themeClasses.dateInput}
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>

              <div>
                <label className={themeClasses.label}>
                  Amount *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className={`${themeClasses.input} pl-8`}
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className={themeClasses.label}>
                Merchant/Vendor *
              </label>
              <input
                type="text"
                required
                className={themeClasses.input}
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                placeholder="e.g., Office Depot, Starbucks"
              />
            </div>

            <div>
              <label className={themeClasses.label}>
                Category *
              </label>
              <select
                required
                className={themeClasses.select}
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                {EXPENSE_CATEGORIES.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={themeClasses.label}>
                Status
              </label>
              <select
                className={themeClasses.select}
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              >
                {EXPENSE_STATUSES.map(status => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={themeClasses.label}>
                Billable
              </label>
              <select
                className={themeClasses.select}
                value={formData.is_billable ? 'yes' : 'no'}
                onChange={(e) => setFormData({ ...formData, is_billable: e.target.value === 'yes' })}
              >
                <option value="no">Non-billable</option>
                <option value="yes">Billable</option>
              </select>
            </div>

            <div>
              <label className={themeClasses.label}>
                Description
              </label>
              <textarea
                rows={3}
                className={themeClasses.textarea}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the expense"
              />
            </div>

            {/* Receipt Upload */}
            <div>
              <label className={themeClasses.label}>
                Receipt
              </label>
              {!receiptFile && !formData.receipt_url ? (
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center bg-muted/30">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Upload with OCR auto-fill or attach a document manually</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <label className={`cursor-pointer ${getButtonClasses('primary')} ${isOCRProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {isOCRProcessing ? 'Processing OCR...' : 'Upload & OCR'}
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleReceiptUploadWithOCR}
                        disabled={isOCRProcessing}
                        className="hidden"
                      />
                    </label>
                    <label className={`cursor-pointer ${getButtonClasses('outline')} ${isAttachmentUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {isAttachmentUploading ? 'Attaching...' : 'Attach File Only'}
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleReceiptUploadWithoutOCR}
                        disabled={isAttachmentUploading}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                  <div className="flex items-center flex-wrap gap-2">
                    <Receipt className="h-5 w-5 text-muted-foreground mr-2" />
                    <span className="text-sm text-foreground">
                      {getReceiptFileName()}
                    </span>
                    {isOCRProcessing && (
                      <span className="inline-flex items-center ml-3 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        OCR processing
                      </span>
                    )}
                    {isAttachmentUploading && (
                      <span className="inline-flex items-center ml-3 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Uploading file
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {formData.receipt_url && (
                      <a
                        href={getReceiptViewerUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        View Receipt
                      </a>
                    )}
                    <label className={`cursor-pointer text-xs ${getButtonClasses('outline')} ${isAttachmentUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      Replace File
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleReceiptUploadWithoutOCR}
                        disabled={isAttachmentUploading}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={removeReceipt}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-4 pt-4">
              <button
                type="button"
                onClick={handleCancel}
                className={getButtonClasses('secondary')}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={getButtonClasses('primary')}
              >
                {expense ? 'Update Expense' : 'Save Expense'}
              </button>
            </div>
          </form>
          </div>
        </div>
      </div>

      <NavigationGuard />
    </div>
  );
};
