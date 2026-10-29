import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { cookieName, type Portal, validateSession } from '@/server/auth';

/*
 * Uploads with real progress. The browser sends each chosen file to /<portal>/api/upload first (so it can show the bytes
 * going), gets back a token, and the form then sends only the token, as "upload:<field>". Every server action that takes
 * a file calls takeUploads(fd) first, which puts the file back under its own field name, so the rest of the action is
 * unchanged. A file waits at most an hour, can be taken once, and only by the person who sent it.
 */

const DIR = path.join(os.tmpdir(), 'madrasah-uploads');
const KEEP_MS = 60 * 60 * 1000;
export const MAX_UPLOAD = 25 * 1024 * 1024; // as next.config's serverActions.bodySizeLimit
const PREFIX = 'upload:';
const TOKEN = /^[A-Za-z0-9_-]{32}$/;
type Meta = { portal: Portal; identityId: number; name: string; type: string };

const stale = async (p: string) => ((await stat(p).catch(() => null))?.mtimeMs ?? 0) < Date.now() - KEEP_MS;
const signedIn = async (portal: Portal) => (await validateSession(db, portal, (await cookies()).get(cookieName(portal))?.value))?.identity.id ?? null;

/** Keeps a file for its sender and returns its token, or null when nobody is signed in to that portal. */
export async function stashUpload(portal: Portal, file: File): Promise<string | null> {
  const identityId = await signedIn(portal);
  if (!identityId) return null;
  await mkdir(DIR, { recursive: true });
  // Clear out files nobody sent on (the form was abandoned).
  for (const f of await readdir(DIR)) if (await stale(path.join(DIR, f))) await rm(path.join(DIR, f), { force: true });
  const token = randomBytes(24).toString('base64url');
  await writeFile(path.join(DIR, token), Buffer.from(await file.arrayBuffer()));
  await writeFile(path.join(DIR, `${token}.json`), JSON.stringify({ portal, identityId, name: file.name, type: file.type } satisfies Meta));
  return token;
}

/** Swaps each "upload:<field>" token in a submitted form for the file it stands for. Unknown, used or other people's tokens are dropped. */
export async function takeUploads(fd: FormData): Promise<FormData> {
  for (const [key, value] of [...fd.entries()]) {
    if (!key.startsWith(PREFIX)) continue;
    fd.delete(key);
    const token = String(value);
    if (!TOKEN.test(token)) continue;
    const body = path.join(DIR, token), info = `${body}.json`;
    const meta = await readFile(info, 'utf8').then((t) => JSON.parse(t) as Meta).catch(() => null);
    if (!meta || await stale(body) || meta.identityId !== await signedIn(meta.portal)) continue;
    const bytes = await readFile(body).catch(() => null);
    await Promise.all([rm(body, { force: true }), rm(info, { force: true })]);
    if (bytes) fd.set(key.slice(PREFIX.length), new File([bytes], meta.name, { type: meta.type }));
  }
  return fd;
}

/** POST /<portal>/api/upload: one file in, its token out. */
export const uploadRoute = (portal: Portal) => async (req: Request) => {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_UPLOAD + 64 * 1024) return Response.json({ error: 'That file is over 25 MB.' }, { status: 413 });
  const file = await req.formData().then((f) => f.get('file')).catch(() => null);
  if (!(file instanceof File) || !file.size) return Response.json({ error: 'No file arrived. Please try again.' }, { status: 400 });
  if (file.size > MAX_UPLOAD) return Response.json({ error: 'That file is over 25 MB.' }, { status: 413 });
  const token = await stashUpload(portal, file);
  if (!token) return Response.json({ error: 'You’ve been signed out. Please sign in again.' }, { status: 401 });
  return Response.json({ token });
};
