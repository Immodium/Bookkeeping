// PDF Service for client-side PDF operations
// Handles PDF generation requests to the server

import { envConfig } from '@/lib/env-config';
import { PDFGenerationOptions } from '@/types';
import { getToken } from '@/utils/api';

// PDFGenerationOptions moved to @/types/common.types.ts

class PDFService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${envConfig.API_URL}/api/pdf`;
  }

  /**
   * Generate PDF for an invoice using auto-generated token
   */
  async generateInvoicePDF(invoiceId: number, options?: PDFGenerationOptions): Promise<Blob> {
    try {
      const token = getToken();
      const response = await fetch(`${this.baseUrl}/invoice/${invoiceId}/download`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Remove Content-Type for PDF download requests
        },
      });

      if (!response.ok) {
        let errorMessage = 'Failed to generate PDF';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // Verify the response is actually a PDF
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/pdf')) {
        throw new Error('Server did not return a PDF file');
      }

      const blob = await response.blob();

      // Verify blob size
      if (blob.size === 0) {
        throw new Error('Received empty PDF file');
      }

      return blob;
    } catch (error) {
      console.error('Error generating invoice PDF:', error);
      throw error;
    }
  }

  /**
   * Generate PDF for an invoice with provided token (for public access)
   */
  async generatePublicInvoicePDF(invoiceId: number, token: string, options?: PDFGenerationOptions): Promise<Blob> {
    try {
      const response = await fetch(`${this.baseUrl}/invoice/${invoiceId}?token=${token}`, {
        method: 'GET',
      });

      if (!response.ok) {
        let errorMessage = 'Failed to generate PDF';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // Verify the response is actually a PDF
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/pdf')) {
        throw new Error('Server did not return a PDF file');
      }

      const blob = await response.blob();

      // Verify blob size
      if (blob.size === 0) {
        throw new Error('Received empty PDF file');
      }

      return blob;
    } catch (error) {
      console.error('Error generating public invoice PDF:', error);
      throw error;
    }
  }

  /**
   * Generate PDF for a custom page/report
   */
  async generatePagePDF(url: string, filename?: string, options?: PDFGenerationOptions): Promise<Blob> {
    try {
      const token = getToken();
      const response = await fetch(`${this.baseUrl}/page`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          filename,
          options
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to generate PDF' }));
        throw new Error(errorData.message || 'Failed to generate PDF');
      }

      return await response.blob();
    } catch (error) {
      console.error('Error generating page PDF:', error);
      throw error;
    }
  }

  /**
   * Download PDF blob as file
   */
  downloadPDF(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Generate and download invoice PDF
   */
  async downloadInvoicePDF(invoiceId: number, invoiceNumber?: string): Promise<void> {
    try {
      const blob = await this.generateInvoicePDF(invoiceId);
      const filename = `Invoice-${invoiceNumber || invoiceId}.pdf`;
      this.downloadPDF(blob, filename);
    } catch (error) {
      console.error('Error downloading invoice PDF:', error);
      throw error;
    }
  }

  /**
   * Generate invoice PDF and trigger browser print dialog.
   */
  async printInvoicePDF(invoiceId: number): Promise<void> {
    let printWindow: Window | null = null;

    try {
      // Open a window immediately so browsers treat this as a user-initiated action.
      printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Please allow pop-ups to print invoices.');
      }

      printWindow.document.write('<html><body style="font-family: sans-serif; padding: 24px;">Preparing invoice for print...</body></html>');
      printWindow.document.close();

      const blob = await this.generateInvoicePDF(invoiceId);
      const pdfUrl = window.URL.createObjectURL(blob);

      printWindow.location.href = pdfUrl;

      const cleanup = () => {
        window.URL.revokeObjectURL(pdfUrl);
      };

      // Trigger print when PDF viewer window finishes loading.
      printWindow.onload = () => {
        printWindow?.focus();
        printWindow?.print();
      };

      printWindow.onafterprint = () => {
        cleanup();
      };

      // Fallback for browsers where onload doesn't fire reliably for PDFs.
      window.setTimeout(() => {
        try {
          printWindow?.focus();
          printWindow?.print();
        } catch {
          // Ignore and let user print manually if browser blocks scripted print.
        }
      }, 1500);
    } catch (error) {
      if (printWindow && !printWindow.closed) {
        printWindow.close();
      }
      console.error('Error printing invoice PDF:', error);
      throw error;
    }
  }

  /**
   * Generate and download public invoice PDF
   * If no token provided, generates a new secure token
   */
  async downloadPublicInvoicePDF(invoiceId: number, token?: string, invoiceNumber?: string): Promise<void> {
    try {
      let publicToken = token;

      // If no token provided, generate a new secure token
      if (!publicToken) {
        publicToken = await this.generatePublicInvoiceToken(invoiceId);
      }

      const blob = await this.generatePublicInvoicePDF(invoiceId, publicToken);
      const filename = `Invoice-${invoiceNumber || invoiceId}.pdf`;
      this.downloadPDF(blob, filename);
    } catch (error) {
      console.error('Error downloading public invoice PDF:', error);
      throw error;
    }
  }

  /**
   * Generate and download report PDF
   */
  async downloadReportPDF(reportUrl: string, reportName: string): Promise<void> {
    try {
      const blob = await this.generatePagePDF(reportUrl, `${reportName}.pdf`);
      this.downloadPDF(blob, `${reportName}.pdf`);
    } catch (error) {
      console.error('Error downloading report PDF:', error);
      throw error;
    }
  }

  /**
   * Export an on-screen element using browser print-to-PDF.
   * Users can choose "Save as PDF" in the print dialog.
   */
  async exportElementToPDF(selector: string, reportName: string): Promise<void> {
    const sourceElement = document.querySelector(selector) as HTMLElement | null;
    if (!sourceElement) {
      throw new Error('Could not find report content to export.');
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Please allow pop-ups to export PDF reports.');
    }

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((styleNode) => styleNode.outerHTML)
      .join('\n');

    const safeTitle = reportName.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'report';

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${safeTitle}</title>
          ${styles}
          <style>
            @page { margin: 0.5in; }
            body { background: white !important; margin: 0; padding: 0; }
            [data-report-actions] { display: none !important; }
          </style>
        </head>
        <body>
          ${sourceElement.outerHTML}
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.focus();
                window.print();
              }, 250);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  /**
   * Get PDF service status
   */
  async getServiceStatus(): Promise<{ status: string; message?: string }> {
    try {
      const token = getToken();
      const response = await fetch(`${this.baseUrl}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get PDF service status');
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting PDF service status:', error);
      throw error;
    }
  }

  /**
   * Generate secure public token for invoice
   */
  async generatePublicInvoiceToken(invoiceId: number): Promise<string> {
    try {
      const token = getToken();
      const response = await fetch(`${this.baseUrl.replace('/pdf', '')}/invoices/${invoiceId}/public-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate public token');
      }

      const result = await response.json();
      return result.data.token;
    } catch (error) {
      console.error('Error generating public token:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const pdfService = new PDFService();
export default pdfService;
