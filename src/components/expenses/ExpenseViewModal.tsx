import React from 'react';
import { X, Calendar, DollarSign, FileText, Tag, Receipt, Clock } from 'lucide-react';
import { getStatusColor, themeClasses } from '@/utils/themeUtils.util';
import { formatDateSync } from '@/components/ui/FormattedDate';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import { ExpenseViewModalProps } from '@/types/components/expense.types';

export const ExpenseViewModal: React.FC<ExpenseViewModalProps> = ({ expense, isOpen, onClose }) => {
  if (!isOpen || !expense) return null;

  // Using imported formatDate and formatDateTime functions
  const handleViewReceipt = () => {
    if (!expense.receipt_url) {
      return;
    }

    const receiptUrl = expense.receipt_url.startsWith('http')
      ? expense.receipt_url
      : `${window.location.origin}${expense.receipt_url}`;
    const popup = window.open('', '_blank', 'width=1100,height=800');

    // If the popup is blocked, fallback to opening the raw receipt URL.
    if (!popup) {
      window.open(receiptUrl, '_blank');
      return;
    }

    const receiptName = expense.receipt_url.split('/').pop() || 'receipt';
    const escapedName = receiptName.replace(/"/g, '&quot;');
    const escapedUrl = receiptUrl.replace(/"/g, '&quot;');

    popup.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Receipt Viewer</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        font-family: Inter, system-ui, -apple-system, sans-serif;
        background: #f8fafc;
        color: #0f172a;
      }
      .toolbar {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid #e2e8f0;
        background: #ffffff;
      }
      .title {
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .actions {
        display: flex;
        gap: 8px;
      }
      button {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #0f172a;
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      button:hover {
        background: #f1f5f9;
      }
      button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }
      #status {
        padding: 16px;
        font-size: 14px;
        color: #475569;
      }
      #preview {
        padding: 12px;
      }
      #preview img,
      #preview iframe,
      #preview embed {
        width: 100%;
        min-height: calc(100vh - 110px);
        border: none;
        border-radius: 10px;
        background: #ffffff;
      }
      #preview img {
        object-fit: contain;
      }
      @media (prefers-color-scheme: dark) {
        body {
          background: #0f172a;
          color: #e2e8f0;
        }
        .toolbar {
          background: #111827;
          border-bottom-color: #334155;
        }
        button {
          background: #111827;
          color: #e2e8f0;
          border-color: #475569;
        }
        button:hover {
          background: #1e293b;
        }
        #status {
          color: #94a3b8;
        }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <div class="title">${escapedName}</div>
      <div class="actions">
        <button id="print-btn" type="button" disabled>Print</button>
        <button id="download-btn" type="button" disabled>Download</button>
      </div>
    </div>
    <div id="status">Loading receipt…</div>
    <div id="preview"></div>

    <script>
      (function () {
        const receiptUrl = "${escapedUrl}";
        const fallbackFileName = "${escapedName}";
        const statusEl = document.getElementById('status');
        const previewEl = document.getElementById('preview');
        const printBtn = document.getElementById('print-btn');
        const downloadBtn = document.getElementById('download-btn');
        let objectUrl = '';
        let fileType = '';

        const detectMimeType = (bytes) => {
          if (bytes.length >= 4) {
            if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
              return 'application/pdf';
            }
            if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
              return 'image/jpeg';
            }
            if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
              return 'image/png';
            }
            if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
              return 'image/gif';
            }
            if (
              bytes.length >= 12 &&
              bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
              bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
            ) {
              return 'image/webp';
            }
          }
          return '';
        };

        const extensionForMime = (mimeType) => {
          if (mimeType === 'application/pdf') return 'pdf';
          if (mimeType === 'image/jpeg') return 'jpg';
          if (mimeType === 'image/png') return 'png';
          if (mimeType === 'image/gif') return 'gif';
          if (mimeType === 'image/webp') return 'webp';
          return '';
        };

        const getDownloadName = () => {
          if (fallbackFileName.includes('.')) {
            return fallbackFileName;
          }
          const ext = extensionForMime(fileType);
          return ext ? fallbackFileName + '.' + ext : fallbackFileName;
        };

        const renderPreview = () => {
          previewEl.innerHTML = '';

          if (fileType.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = objectUrl;
            img.alt = 'Expense receipt';
            previewEl.appendChild(img);
            return;
          }

          const frame = document.createElement('iframe');
          frame.src = objectUrl;
          frame.title = 'Receipt preview';
          previewEl.appendChild(frame);
        };

        const handlePrint = () => {
          if (!objectUrl) {
            return;
          }

          if (fileType.startsWith('image/')) {
            const printWindow = window.open('', '_blank', 'width=900,height=700');
            if (!printWindow) {
              return;
            }
            printWindow.document.write(
              '<!doctype html><html><head><title>Print receipt</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;background:#fff;"><img src="' +
                objectUrl +
                '" style="max-width:100%;max-height:100vh;" alt="Receipt" onload="window.focus();window.print();" /></body></html>'
            );
            printWindow.document.close();
            return;
          }

          const iframe = previewEl.querySelector('iframe');
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            return;
          }

          window.print();
        };

        const handleDownload = () => {
          if (!objectUrl) {
            return;
          }
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = getDownloadName();
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        };

        const loadReceipt = async () => {
          try {
            const response = await fetch(receiptUrl, { credentials: 'include' });
            if (!response.ok) {
              throw new Error('Failed to load receipt (' + response.status + ')');
            }

            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer.slice(0, 16));
            const detectedType = detectMimeType(bytes);
            const headerType = response.headers.get('content-type') || '';
            fileType = detectedType || (headerType === 'application/octet-stream' ? '' : headerType) || 'application/pdf';

            const blob = new Blob([buffer], { type: fileType });
            objectUrl = URL.createObjectURL(blob);
            renderPreview();
            statusEl.textContent = '';
            printBtn.disabled = false;
            downloadBtn.disabled = false;
          } catch (error) {
            statusEl.textContent = error instanceof Error ? error.message : 'Unable to load receipt';
          }
        };

        printBtn.addEventListener('click', handlePrint);
        downloadBtn.addEventListener('click', handleDownload);
        window.addEventListener('beforeunload', () => {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
          }
        });

        loadReceipt();
      })();
    </script>
  </body>
</html>`);
    popup.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={`${themeClasses.card} rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto`}>
        <div className={`flex justify-between items-center p-6 ${themeClasses.cardHeader}`}>
          <h2 className={`text-2xl font-bold ${themeClasses.cardTitle}`}>Expense Details</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium text-foreground">{formatDateSync(expense.date)}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Vendor</p>
                  <p className="font-medium text-foreground">{expense.vendor || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Tag className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium text-foreground">{expense.category}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium text-foreground text-lg">
                    <FormattedCurrency amount={expense.amount} />
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="h-5 w-5 flex items-center justify-center">
                  <div className="h-3 w-3 rounded-full bg-blue-600 dark:bg-blue-400"></div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <span className={getStatusColor(expense.status || 'pending')}>
                    {expense.status ? expense.status.charAt(0).toUpperCase() + expense.status.slice(1) : 'Pending'}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Receipt className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Receipt</p>
                  {expense.receipt_url ? (
                    <button
                      type="button"
                      onClick={handleViewReceipt}
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                    >
                      View Receipt
                    </button>
                  ) : (
                    <p className="text-muted-foreground">No receipt attached</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          {expense.description && (
            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">Description</h3>
              <p className="text-foreground bg-muted/30 p-4 rounded-lg">{expense.description}</p>
            </div>
          )}

          {/* Timestamps */}
          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold text-foreground mb-3">Timeline</h3>
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-sm text-muted-foreground">Created: </span>
                  <span className="text-sm text-foreground">{formatDateSync(expense.created_at)}</span>
                </div>
              </div>
              {expense.updated_at && expense.updated_at !== expense.created_at && (
                <div className="flex items-center space-x-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-sm text-muted-foreground">Last updated: </span>
                    <span className="text-sm text-foreground">{formatDateSync(expense.updated_at)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`flex justify-end p-6 ${themeClasses.cardFooter}`}>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
