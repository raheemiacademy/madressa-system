import Papa from 'papaparse';

/** Cells starting with these can run as formulas when the CSV is opened in Excel; prefix them so they stay text. */
const FORMULA = /^[=+\-@\t\r]/;
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v);
  return FORMULA.test(s) ? `'${s}` : s;
};

export function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 names (Arabic, accents) correctly.
  return '﻿' + Papa.unparse({ fields: headers, data: rows.map((r) => r.map(cell)) }, { newline: '\r\n' });
}

export function csvResponse(filename: string, csv: string) {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'no-store'
    }
  });
}

/** Parses an uploaded CSV with a header row. Header names are normalised to snake_case. */
export function parseCsv(text: string): { rows: Record<string, string>[]; headers: string[]; error?: string } {
  const r = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true, skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
    transform: (v) => v.trim()
  });
  if (r.errors.length && !r.data.length) return { rows: [], headers: [], error: r.errors[0]?.message ?? 'The file could not be read' };
  if (r.data.length > 5000) return { rows: [], headers: [], error: 'Import up to 5,000 rows at a time' };
  return { rows: r.data, headers: r.meta.fields ?? [] };
}

/** Accepts DD/MM/YYYY (UK) or YYYY-MM-DD; returns YYYY-MM-DD, '' for blank, or null if it isn't a real date. */
export function csvDate(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s) return '';
  let y: number, m: number, d: number;
  const uk = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (uk) [d, m, y] = [Number(uk[1]), Number(uk[2]), Number(uk[3])];
  else if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}

export const csvBool = (v: string | undefined) => /^(1|y|yes|true|on)$/i.test((v ?? '').trim());

/** "1,2-3" or "1 2 3" → [1, 2, 3] style ID lists (hyphens and commas both separate). */
export const csvIds = (v: string | undefined) => (v ?? '').split(/[\s,;-]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n > 0);

export async function readUpload(fd: FormData, name = 'file'): Promise<{ text: string } | { error: string }> {
  const f = fd.get(name);
  if (!(f instanceof File) || f.size === 0) return { error: 'Choose a CSV file' };
  if (f.size > 5 * 1024 * 1024) return { error: 'Use a file under 5 MB' };
  return { text: await f.text() };
}

/** First worksheet of an .xlsx file as header-keyed rows (same shape as parseCsv). */
export async function parseXlsx(buf: ArrayBuffer): Promise<{ rows: Record<string, string>[]; headers: string[]; error?: string }> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); } catch { return { rows: [], headers: [], error: 'The file isn’t a readable Excel (.xlsx) workbook' }; }
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], headers: [], error: 'The workbook has no sheets' };
  const text = (v: unknown) => (v && typeof v === 'object' && 'text' in v ? String((v as { text: unknown }).text) : v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? '' : String(v)).trim();
  const headers = ((ws.getRow(1).values as unknown[]) ?? []).slice(1).map((h) => text(h).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const rows: Record<string, string>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1 || rows.length >= 5000) return;
    const vals = (row.values as unknown[]).slice(1);
    const rec = Object.fromEntries(headers.map((h, i) => [h, text(vals[i])]));
    if (Object.values(rec).some(Boolean)) rows.push(rec);
  });
  return { rows, headers };
}
