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

const TOTAL_LABEL_PATTERN = /\b(grand\s*total|total\s*due|amount\s*due|balance\s*due|total|amount|balance)\b/i;
const CURRENCY_VALUE_PATTERN =
  /[$€£]?\s*-?\d{1,3}(?:[,\s.]\d{3})*(?:[.,]\d{1,2})|[$€£]?\s*-?\d+(?:[.,]\d{1,2})/gi;

export const parseCurrencyAmount = (rawValue: string): number | undefined => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return undefined;
  }

  const compact = trimmed.replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
  if (!compact) {
    return undefined;
  }

  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  let normalized = compact;

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = normalized.split(thousandsSeparator).join('');
    if (decimalSeparator === ',') {
      normalized = normalized.replace(',', '.');
    }
  } else if (lastComma !== -1) {
    const decimalDigits = compact.length - lastComma - 1;
    normalized = decimalDigits >= 1 && decimalDigits <= 2 ? compact.replace(',', '.') : compact.replace(/,/g, '');
  } else if (lastDot !== -1) {
    const decimalDigits = compact.length - lastDot - 1;
    normalized = decimalDigits >= 1 && decimalDigits <= 2 ? compact : compact.replace(/\./g, '');
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export const extractAmountFromReceiptText = (text: string): number | undefined => {
  if (!text.trim()) {
    return undefined;
  }

  const labeledMatches: number[] = [];
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    const hasTotalLabel = TOTAL_LABEL_PATTERN.test(line);
    TOTAL_LABEL_PATTERN.lastIndex = 0;

    if (!hasTotalLabel) {
      continue;
    }

    const inlineMatches = line.match(CURRENCY_VALUE_PATTERN) ?? [];
    for (const candidate of inlineMatches) {
      const amount = parseCurrencyAmount(candidate);
      if (amount) {
        labeledMatches.push(amount);
      }
    }

    if (inlineMatches.length === 0 && index + 1 < lines.length) {
      const nextLine = lines[index + 1];
      const nextLineMatches = nextLine?.match(CURRENCY_VALUE_PATTERN) ?? [];
      for (const candidate of nextLineMatches) {
        const amount = parseCurrencyAmount(candidate);
        if (amount) {
          labeledMatches.push(amount);
        }
      }
    }
  }

  if (labeledMatches.length > 0) {
    return Math.max(...labeledMatches);
  }

  const fallbackMatches = text.match(CURRENCY_VALUE_PATTERN) ?? [];
  const fallbackAmounts = fallbackMatches
    .map((candidate) => parseCurrencyAmount(candidate))
    .filter((amount): amount is number => typeof amount === 'number');

  if (fallbackAmounts.length > 0) {
    return Math.max(...fallbackAmounts);
  }

  return undefined;
};

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
    return extractAmountFromReceiptText(text);
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
