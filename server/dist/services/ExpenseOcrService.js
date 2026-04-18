import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { basename } from 'path';
const TEXT_MIME_TYPES = new Set([
    'text/plain',
    'application/json',
    'application/xml',
    'text/csv'
]);
const IMAGE_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif'
]);
const PDF_MIME_TYPES = new Set([
    'application/pdf'
]);
const CATEGORY_KEYWORDS = [
    { category: 'Travel', tokens: ['uber', 'lyft', 'taxi', 'airline', 'flight', 'hotel', 'parking', 'toll'] },
    { category: 'Meals & Entertainment', tokens: ['restaurant', 'coffee', 'cafe', 'meal', 'dinner', 'lunch', 'bar'] },
    { category: 'Software', tokens: ['subscription', 'saas', 'software', 'license', 'hosting', 'cloud'] },
    { category: 'Marketing', tokens: ['ads', 'advertising', 'campaign', 'promotion', 'facebook', 'google ads'] },
    { category: 'Office Supplies', tokens: ['office', 'staples', 'depot', 'printer', 'paper', 'ink'] }
];
const parseAmount = (text) => {
    const amountMatches = [...text.matchAll(/(?:total|amount|balance|due)?\s*[:$]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+(?:\.\d{2}))/gi)];
    if (amountMatches.length > 0) {
        const lastMatch = amountMatches[amountMatches.length - 1][1];
        const parsed = Number.parseFloat(lastMatch.replace(/,/g, ''));
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return null;
};
const parseDate = (text) => {
    const isoMatch = text.match(/\b(20\d{2})[-\/](0[1-9]|1[0-2])[-\/](0[1-9]|[12]\d|3[01])\b/);
    if (isoMatch) {
        const y = isoMatch[1];
        const m = isoMatch[2];
        const d = isoMatch[3];
        return `${y}-${m}-${d}`;
    }
    const usMatch = text.match(/\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](20\d{2})\b/);
    if (usMatch) {
        const month = usMatch[1].padStart(2, '0');
        const day = usMatch[2].padStart(2, '0');
        const year = usMatch[3];
        return `${year}-${month}-${day}`;
    }
    return new Date().toISOString().split('T')[0];
};
const inferCategory = (text) => {
    const normalized = text.toLowerCase();
    for (const mapping of CATEGORY_KEYWORDS) {
        if (mapping.tokens.some(token => normalized.includes(token))) {
            return mapping.category;
        }
    }
    return 'Other';
};
const parseVendor = (text) => {
    const lines = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    if (lines.length === 0) {
        return 'Unknown Vendor';
    }
    const vendorLine = lines.find(line => /[a-z]/i.test(line) && !line.toLowerCase().includes('receipt'));
    return vendorLine ? vendorLine.slice(0, 100) : 'Unknown Vendor';
};
const parseDescription = (text) => {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
        return 'Receipt import';
    }
    return cleaned.slice(0, 180);
};
const mapConfidence = (sourceText, extraction) => {
    let score = 0.3;
    if (sourceText.length > 25) {
        score += 0.25;
    }
    if (extraction.amount && extraction.amount > 0) {
        score += 0.25;
    }
    if (extraction.vendor && extraction.vendor !== 'Unknown Vendor') {
        score += 0.1;
    }
    if (extraction.date) {
        score += 0.1;
    }
    return Math.min(0.99, Number(score.toFixed(2)));
};
const parseTextFromFile = async (file) => {
    if (TEXT_MIME_TYPES.has(file.mimetype)) {
        return await fs.readFile(file.path, 'utf8');
    }
    if (PDF_MIME_TYPES.has(file.mimetype) || IMAGE_MIME_TYPES.has(file.mimetype)) {
        throw new Error('OCR for this file type is not available in this environment yet. Please upload a text-based document.');
    }
    throw new Error('Unsupported document type for OCR');
};
const getSafeReceiptUrl = (file) => {
    const safeName = basename(file.filename || file.originalname).replace(/[^\w.-]/g, '_');
    return `/uploads/expenses/${safeName}`;
};
export class ExpenseOcrService {
    async extractExpenseFromDocument(file) {
        if (!file) {
            throw new Error('No document uploaded');
        }
        const rawText = await parseTextFromFile(file);
        const normalizedText = rawText.trim();
        if (!normalizedText) {
            throw new Error('Unable to extract readable text from uploaded document');
        }
        const amount = parseAmount(normalizedText);
        if (!amount) {
            throw new Error('Unable to determine expense amount from document');
        }
        const vendor = parseVendor(normalizedText);
        const date = parseDate(normalizedText);
        const category = inferCategory(normalizedText);
        const description = parseDescription(normalizedText);
        const checksum = createHash('sha1').update(normalizedText).digest('hex');
        const extractedExpense = {
            date,
            vendor,
            category,
            amount,
            description,
            receipt_url: getSafeReceiptUrl(file),
            status: 'pending'
        };
        return {
            extractedExpense,
            metadata: {
                fileName: file.originalname,
                mimeType: file.mimetype,
                fileSize: file.size,
                checksum,
                confidence: mapConfidence(normalizedText, extractedExpense)
            }
        };
    }
}
export const expenseOcrService = new ExpenseOcrService();
