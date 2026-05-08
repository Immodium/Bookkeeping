type CSVValue = string | number | boolean | null | undefined;
type CSVRow = Record<string, CSVValue>;

const CSV_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel'
]);

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
  const isCsv =
    extension === 'csv' ||
    CSV_MIME_TYPES.has(file.type) ||
    file.type === '';

  if (!isCsv) {
    throw new Error('Only CSV files are supported');
  }

  const csvText = await file.text();
  return parseCSV(csvText);
};
