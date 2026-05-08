type CSVValue = string | number | boolean | null | undefined;
type CSVRow = Record<string, CSVValue>;

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]);

export const exportToXLSX = async (
  rows: CSVRow[],
  filename = 'export.xlsx',
  sheetName = 'Sheet1'
): Promise<void> => {
  if (!rows.length) {
    return;
  }

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach(key => set.add(key));
      return set;
    }, new Set<string>())
  );

  worksheet.addRow(headers);
  rows.forEach(row => {
    worksheet.addRow(headers.map(header => row[header] ?? ''));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const excelValueToString = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().split('T')[0] || value.toISOString();
  }

  if (typeof value === 'object') {
    if ('text' in value && typeof (value as { text?: unknown }).text === 'string') {
      return (value as { text: string }).text;
    }

    if ('richText' in value && Array.isArray((value as { richText?: Array<{ text?: string }> }).richText)) {
      return (value as { richText: Array<{ text?: string }> }).richText
        .map(chunk => chunk.text || '')
        .join('');
    }

    if ('result' in value) {
      return String((value as { result?: unknown }).result ?? '');
    }

    if ('hyperlink' in value) {
      const candidate = value as { text?: unknown; hyperlink?: unknown };
      if (typeof candidate.text === 'string') {
        return candidate.text;
      }
      if (typeof candidate.hyperlink === 'string') {
        return candidate.hyperlink;
      }
    }
  }

  return String(value);
};

export const parseXLSX = async (file: File): Promise<Array<Record<string, string>>> => {
  const ExcelJS = await import('exceljs');
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const headerRow = worksheet.getRow(1);
  const rawHeaders = (headerRow.values as Array<unknown>).slice(1).map(value => excelValueToString(value).trim());
  const headers = rawHeaders.map((header, index) => header || `Column ${index + 1}`);

  if (!headers.length) {
    return [];
  }

  const results: Array<Record<string, string>> = [];
  for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const values = (row.values as Array<unknown>).slice(1);
    const normalizedValues = headers.map((_, index) => excelValueToString(values[index]));

    if (normalizedValues.every(value => value.trim() === '')) {
      continue;
    }

    const normalizedRow: Record<string, string> = {};
    headers.forEach((header, index) => {
      normalizedRow[header] = normalizedValues[index] ?? '';
    });
    results.push(normalizedRow);
  }

  return results;
};

const escapeCsvCell = (value: CSVValue): string => {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

const splitCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map(value => value.trim());
};

export const exportToCSV = (rows: CSVRow[], filename = 'export.csv'): void => {
  if (!rows.length) {
    return;
  }

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach(key => set.add(key));
      return set;
    }, new Set<string>())
  );

  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map(row => headers.map(header => escapeCsvCell(row[header])).join(','))
  ];

  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.setAttribute('download', filename);
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const parseCSV = (csvText: string): Array<Record<string, string>> => {
  if (!csvText || !csvText.trim()) {
    return [];
  }

  const lines = csvText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1);

  return rows.map(line => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });

    return row;
  });
};

export const parseSpreadsheetFile = async (file: File): Promise<Array<Record<string, string>>> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const isXlsx =
    extension === 'xlsx' ||
    extension === 'xls' ||
    XLSX_MIME_TYPES.has(file.type);

  if (isXlsx) {
    return parseXLSX(file);
  }

  const csvText = await file.text();
  return parseCSV(csvText);
};
