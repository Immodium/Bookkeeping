import Tesseract from 'tesseract.js';

export interface ParsedReceiptData {
  vendor?: string;
  amount?: number;
  date?: string;
  category?: string;
  description?: string;
}

const DEFAULT_CATEGORY = 'Other';

const CATEGORY_HINTS: Array<{ category: string; keywords: string[] }> = [
  { category: 'Meals & Entertainment', keywords: ['restaurant', 'cafe', 'coffee', 'bar', 'diner', 'grill'] },
  { category: 'Travel', keywords: ['airlines', 'hotel', 'uber', 'lyft', 'taxi', 'flight', 'train', 'parking'] },
  { category: 'Office Supplies', keywords: ['office', 'staples', 'paper', 'supplies', 'depot'] },
  { category: 'Software', keywords: ['software', 'subscription', 'license', 'saas', 'cloud'] },
  { category: 'Marketing', keywords: ['ads', 'advertising', 'campaign', 'marketing', 'promotion'] }
];

export class ReceiptOCRService {
  async parseReceipt(filePath: string): Promise<ParsedReceiptData> {
    const { data } = await Tesseract.recognize(filePath, 'eng');
    const text = data.text || '';
    const parsed: ParsedReceiptData = {
      category: this.inferCategory(text),
      description: this.buildDescription(text)
    };

    const vendor = this.extractVendor(text);
    const amount = this.extractAmount(text);
    const date = this.extractDate(text);
    if (vendor) parsed.vendor = vendor;
    if (typeof amount === 'number') parsed.amount = amount;
    if (date) parsed.date = date;

    return parsed;
  }

  private extractVendor(text: string): string | undefined {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 2);

    const candidate = lines.find((line) => /[a-z]/i.test(line) && !/invoice|receipt|tax|total/i.test(line));
    return candidate?.slice(0, 100);
  }

  private extractAmount(text: string): number | undefined {
    const amountPattern = /(total|amount|balance)[^\d]{0,10}(\d{1,4}(?:[.,]\d{2})?)/gi;
    let match: RegExpExecArray | null = null;
    let lastAmount: number | undefined;

    while ((match = amountPattern.exec(text)) !== null) {
      const amountText = match[2];
      if (!amountText) continue;
      const parsed = parseFloat(amountText.replace(',', '.'));
      if (!Number.isNaN(parsed) && parsed > 0) {
        lastAmount = parsed;
      }
    }

    if (lastAmount) return lastAmount;

    const anyAmountPattern = /\b(\d{1,4}(?:[.,]\d{2}))\b/g;
    const amounts = Array.from(text.matchAll(anyAmountPattern))
      .map((m) => {
        const amountText = m[1];
        return amountText ? parseFloat(amountText.replace(',', '.')) : Number.NaN;
      })
      .filter((num) => !Number.isNaN(num) && num > 0);

    return amounts.length ? Math.max(...amounts) : undefined;
  }

  private extractDate(text: string): string | undefined {
    const isoLike = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
    if (isoLike) {
      const [, y, m, d] = isoLike;
      if (y && m && d) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }

    const usLike = text.match(/\b(0?[1-9]|1[0-2])[/.-](0?[1-9]|[12]\d|3[01])[/.-](20\d{2})\b/);
    if (usLike) {
      const [, m, d, y] = usLike;
      if (y && m && d) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }

    return undefined;
  }

  private inferCategory(text: string): string {
    const normalized = text.toLowerCase();
    for (const hint of CATEGORY_HINTS) {
      if (hint.keywords.some((keyword) => normalized.includes(keyword))) {
        return hint.category;
      }
    }
    return DEFAULT_CATEGORY;
  }

  private buildDescription(text: string): string {
    const summary = text
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);

    return summary || 'Imported from receipt OCR';
  }
}

export const receiptOCRService = new ReceiptOCRService();

export const extractReceiptDataFromFile = async (filePath: string): Promise<ParsedReceiptData> => {
  return receiptOCRService.parseReceipt(filePath);
};
