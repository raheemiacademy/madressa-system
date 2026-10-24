'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { resolveYear } from '@/server/academic-years';
import { actorOf, requireAdmin } from '@/server/next/actor';
import { parseCsv, parseXlsx } from '@/server/people/csv';
import { applyMapping, guessMapping, targetsFor, usesTemplate } from '@/server/people/column-match';
import { checkRows, commitRows, quickAddRows, type ImportKind, type RowResult } from '@/server/people/imports';

export type ImportState = { rows?: Record<string, string>[]; results?: RowResult[]; done?: string; error?: string;
  match?: { headers: string[]; raw: Record<string, string>[]; mapping: Record<string, string> } } | undefined;
const KINDS: ImportKind[] = ['students', 'contacts', 'teachers', 'classes'];

async function yearId() {
  return (await resolveYear(db, Number((await cookies()).get('year_id')?.value) || null)).year?.id ?? null;
}

/** Step 1: read the file (or pasted text) and validate every row without writing anything. */
export async function previewImport(kind: ImportKind, _p: ImportState, fd: FormData): Promise<ImportState> {
  await requireAdmin('edit');
  if (!KINDS.includes(kind)) return { error: 'Unknown import' };
  let parsed: { rows: Record<string, string>[]; headers?: string[]; error?: string };
  const file = fd.get('file');
  const pasted = String(fd.get('paste') ?? '').trim();
  const quick = String(fd.get('quick') ?? '').trim();
  if (kind === 'classes' && quick) parsed = { rows: quickAddRows(quick, { year_group: String(fd.get('defaultYearGroup') ?? ''), teacher: String(fd.get('defaultTeacher') ?? '') }) };
  else if (pasted) parsed = parseCsv(pasted.slice(0, 2_000_000));
  else if (file instanceof File && file.size) {
    if (file.size > 5 * 1024 * 1024) return { error: 'Use a file under 5 MB.' };
    parsed = /\.xlsx$/i.test(file.name) ? await parseXlsx(await file.arrayBuffer()) : parseCsv(await file.text());
  } else return { error: kind === 'classes' ? 'Choose a file, paste rows, or type class names.' : 'Choose a CSV or Excel file, or paste rows.' };
  if (parsed.error) return { error: parsed.error };
  if (!parsed.rows.length) return { error: 'No rows found under the header row.' };
  // Their own layout: ask them to check how the columns are matched before anything is checked.
  const headers = parsed.headers?.length ? parsed.headers : Object.keys(parsed.rows[0]!);
  if (!usesTemplate(kind, headers)) return { match: { headers, raw: parsed.rows, mapping: guessMapping(kind, headers) } };
  return { rows: parsed.rows, results: await checkRows(db, kind, parsed.rows, await yearId()) };
}

/** Step 1b (own layout): rename their columns as matched, then check every row as usual. */
export async function previewMatched(kind: ImportKind, raw: Record<string, string>[], mapping: Record<string, string>): Promise<ImportState> {
  await requireAdmin('edit');
  if (!KINDS.includes(kind) || !Array.isArray(raw) || raw.length > 5000) return { error: 'Nothing to check' };
  const allowed = new Set(targetsFor(kind).map((t) => t.value));
  const clean = Object.fromEntries(Object.entries(mapping).filter(([, to]) => allowed.has(to)));
  const rows = applyMapping(raw, clean);
  if (!Object.values(clean).some(Boolean)) return { error: 'Match at least one column.' };
  return { rows, results: await checkRows(db, kind, rows, await yearId()) };
}

/** Step 2: re-validate the same rows on the server and write the good ones. */
export async function commitImport(kind: ImportKind, rows: Record<string, string>[]): Promise<ImportState> {
  const a = await requireAdmin('edit');
  if (!KINDS.includes(kind) || !Array.isArray(rows) || rows.length > 5000) return { error: 'Nothing to import' };
  const clean = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => /^[a-z0-9_]{1,40}$/.test(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 5000)])));
  const y = await yearId();
  const results = await checkRows(db, kind, clean, y);
  const r = await commitRows(db, actorOf(a), kind, results, y);
  revalidatePath('/admin', 'layout');
  return { done: `${r.added} added, ${r.updated} updated, ${r.skipped} skipped.` };
}
