import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DbOrTx } from '@/db';
import { fileObject } from '@/db/schema';

// shortcut: local-disk driver only; the S3 driver from DECISIONS.md lands with Phase 9 deployment work.
const root = () => path.resolve(process.env.STORAGE_LOCAL_DIR ?? './storage');
const pathFor = (key: string) => {
  const p = path.join(root(), key);
  if (!p.startsWith(root() + path.sep)) throw new Error('Bad storage key');
  return p;
};

export const readStored = (key: string) => readFile(pathFor(key));
export const removeStored = (key: string) => rm(pathFor(key), { force: true });

/** Detects the real type from the file's first bytes — the browser-supplied type is not trusted. */
export function sniffMime(b: Buffer): string | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') return b.toString('latin1', 8, 11) === 'M4A' ? 'audio/mp4' : 'video/mp4';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE') return 'audio/wav';
  if (b.length >= 4 && b.toString('latin1', 0, 4) === 'OggS') return 'audio/ogg';
  if (b.length >= 3 && (b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0))) return 'audio/mpeg';
  if (b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3) return 'video/webm';
  if (b.length >= 5 && b.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

export const UPLOAD_RULES = {
  image: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 5 * 1024 * 1024, label: 'a PNG, JPEG or WebP image up to 5 MB' },
  video: { mimes: ['video/mp4', 'video/webm'], maxBytes: 20 * 1024 * 1024, label: 'an MP4 or WebM video up to 20 MB' },
  pdf: { mimes: ['application/pdf'], maxBytes: 10 * 1024 * 1024, label: 'a PDF up to 10 MB' },
  // Homework handed in from the parent portal: a photo, a PDF, or a recording (phones record m4a, webm or mp3).
  homework: { mimes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'video/webm', 'video/mp4'], maxBytes: 20 * 1024 * 1024, label: 'a photo, PDF or recording up to 20 MB' }
} as const;

export type UploadKind = keyof typeof UPLOAD_RULES;

export async function storeUpload(db: DbOrTx, file: File, kind: UploadKind, purpose: string, createdBy: number | null) {
  const rule = UPLOAD_RULES[kind];
  if (file.size > rule.maxBytes) return { ok: false as const, error: `Upload ${rule.label}.` };
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime || !(rule.mimes as readonly string[]).includes(mime)) return { ok: false as const, error: `Upload ${rule.label}.` };
  const key = `${purpose}/${randomUUID()}`;
  await mkdir(path.dirname(pathFor(key)), { recursive: true });
  await writeFile(pathFor(key), buf);
  const [row] = await db.insert(fileObject).values({ storageKey: key, filename: file.name.slice(0, 200) || 'upload', mime, size: buf.length, purpose, createdBy }).returning();
  return { ok: true as const, file: row! };
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', csv: 'text/csv', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', mp4: 'video/mp4', mov: 'video/quicktime'
};
// Never stored whatever the settings say: they can run script when opened from our origin.
const BLOCKED = new Set(['html', 'htm', 'svg', 'xhtml', 'xml', 'js', 'mjs', 'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'vbs', 'ps1', 'sh', 'jar']);

/** Documents and media attached to records, limited to the school's allowed extensions (§4 File storage). Served only as downloads. */
export async function storeAttachment(db: DbOrTx, file: File, allowed: string[], purpose: string, createdBy: number | null) {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!ext || BLOCKED.has(ext) || !allowed.includes(ext)) return { ok: false as const, error: `Files ending .${ext || '?'} aren’t allowed. Allowed: ${allowed.join(', ')}.` };
  if (file.size > 10 * 1024 * 1024) return { ok: false as const, error: 'Use a file under 10 MB.' };
  const buf = Buffer.from(await file.arrayBuffer());
  const key = `${purpose}/${randomUUID()}`;
  await mkdir(path.dirname(pathFor(key)), { recursive: true });
  await writeFile(pathFor(key), buf);
  const [row] = await db.insert(fileObject).values({ storageKey: key, filename: file.name.replace(/[\/\r\n"]/g, '_').slice(0, 200), mime: MIME[ext] ?? 'application/octet-stream', size: buf.length, purpose, createdBy }).returning();
  return { ok: true as const, file: row! };
}
