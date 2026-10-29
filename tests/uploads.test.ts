import { utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cookieName, createSession } from '@/server/auth';
import { stashUpload, takeUploads, uploadRoute } from '@/server/uploads';
import { db, makeStaff, resetDb } from './helpers';

// The signed-in person for each request, as next/headers would read it from the browser's cookie.
let jar: Record<string, string> = {};
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (k: string) => (jar[k] ? { value: jar[k] } : undefined) }) }));
const signInAs = async (identityId: number) => { jar = { [cookieName('admin')]: (await createSession(db, identityId, 'admin')).token }; };
const form = (token: string) => { const fd = new FormData(); fd.set('upload:file', token); fd.set('title', 'Notes'); return fd; };

beforeEach(async () => { await resetDb(); jar = {}; });

describe('uploads with progress (FileDrop → /admin/api/upload → takeUploads)', () => {
  it('gives the file back, once, under its own field name', async () => {
    const { identity } = await makeStaff();
    await signInAs(identity.id);
    const token = (await stashUpload('admin', new File(['hello'], 'notes.txt', { type: 'text/plain' })))!;
    const fd = await takeUploads(form(token));
    const f = fd.get('file') as File;
    expect([f.name, f.type, await f.text(), fd.has('upload:file'), fd.get('title')]).toEqual(['notes.txt', 'text/plain', 'hello', false, 'Notes']);
    expect((await takeUploads(form(token))).has('file')).toBe(false); // already taken
  });

  it('is only for the person who sent it, and only for an hour', async () => {
    const a = await makeStaff(), b = await makeStaff();
    await signInAs(a.identity.id);
    const token = (await stashUpload('admin', new File(['x'], 'x.txt')))!;
    await signInAs(b.identity.id);
    expect((await takeUploads(form(token))).has('file')).toBe(false);
    await signInAs(a.identity.id);
    const late = (await stashUpload('admin', new File(['y'], 'y.txt')))!;
    const hourAgo = new Date(Date.now() - 61 * 60 * 1000);
    await utimes(path.join(os.tmpdir(), 'madrasah-uploads', late), hourAgo, hourAgo);
    expect((await takeUploads(form(late))).has('file')).toBe(false);
    expect((await takeUploads(form('../../etc/passwd'))).has('file')).toBe(false);
  });

  it('the route refuses anyone signed out, and empty uploads', async () => {
    const send = (body: FormData) => uploadRoute('admin')(new Request('http://x/admin/api/upload', { method: 'POST', body }));
    const one = () => { const fd = new FormData(); fd.set('file', new File(['z'], 'z.txt')); return fd; };
    expect((await send(one())).status).toBe(401);
    const { identity } = await makeStaff();
    await signInAs(identity.id);
    expect((await send(new FormData())).status).toBe(400);
    const ok = await send(one());
    expect(ok.status).toBe(200);
    expect((await ok.json()).token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
