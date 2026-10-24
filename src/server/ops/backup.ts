import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { desc, eq, lt, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/db';
import { backup } from '@/db/schema';
import { audit, type AuditActor } from '../audit';
import { parseKey } from '../crypto';
import { readStored, removeStored, writeStored } from '../storage';
import { log } from './logs';

/*
 * §3 Backup: a full export of the school's data, made by the app itself (no pg_dump, so the host's Postgres client version
 * never matters). Every table's rows are exported as JSON, gzipped, and encrypted with BACKUP_ENCRYPTION_KEY (AES-256-GCM),
 * because a backup holds children's data. Restore replaces everything in one transaction, or changes nothing.
 * shortcut: the whole export is built in memory, which suits a single school's data; stream it if the database grows past a few hundred MB.
 */

// Not part of a backup: sign-in sessions and throttles (restoring signs everyone out), the backup list itself, and worker status.
const SKIP = new Set(['session', 'rate_limit', 'backup', 'worker_heartbeat']);
const MAGIC = Buffer.from('RABK1');

export const backupsConfigured = () => !!process.env.BACKUP_ENCRYPTION_KEY;
const backupKey = () => {
  try { return parseKey(process.env.BACKUP_ENCRYPTION_KEY ?? ''); } catch { throw new Error('BACKUP_ENCRYPTION_KEY must be 32 bytes, as 64 hex characters or base64'); }
};

export function sealBackup(plain: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', backupKey(), iv);
  const body = Buffer.concat([c.update(gzipSync(plain)), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}
export function openBackup(sealed: Buffer) {
  if (!sealed.subarray(0, 5).equals(MAGIC)) throw new Error('This isn’t a backup file');
  const d = createDecipheriv('aes-256-gcm', backupKey(), sealed.subarray(5, 17));
  d.setAuthTag(sealed.subarray(17, 33));
  return gunzipSync(Buffer.concat([d.update(sealed.subarray(33)), d.final()]));
}
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function tables(db: DbOrTx) {
  const rows = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' order by tablename`);
  return [...rows].map((r) => r.tablename).filter((t) => !SKIP.has(t));
}
/** Which migrations the data was taken at: a backup only restores into the same schema. */
async function schemaVersion(db: DbOrTx) {
  const [r] = await db.execute<{ n: number; hash: string | null }>(sql`select count(*)::int as n, (select hash from drizzle.__drizzle_migrations order by created_at desc limit 1) as hash from drizzle.__drizzle_migrations`);
  return `${r!.n}:${(r!.hash ?? '').slice(0, 12)}`;
}

/** Full Backup Now (or the nightly one). */
export async function createBackup(db: Db, by: string, kind: 'manual' | 'nightly') {
  if (!backupsConfigured()) return { ok: false as const, error: 'Backups need BACKUP_ENCRYPTION_KEY to be set on the server' };
  const data: Record<string, unknown[]> = {};
  let rowCount = 0;
  const version = await schemaVersion(db);
  await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read`); // one consistent snapshot across tables
    for (const t of await tables(tx)) {
      const [r] = await tx.execute<{ rows: unknown[] }>(sql`select coalesce(json_agg(x), '[]'::json) as rows from ${sql.identifier(t)} x`);
      data[t] = r!.rows;
      rowCount += r!.rows.length;
    }
  });
  const sealed = sealBackup(Buffer.from(JSON.stringify({ format: 1, version, takenAt: new Date().toISOString(), tables: data })));
  const key = `backups/${new Date().toISOString().slice(0, 10)}-${randomUUID()}.rabk`;
  await writeStored(key, sealed, 'application/octet-stream');
  const [row] = await db.insert(backup).values({ createdBy: by, kind, size: sealed.length, storageKey: key, checksum: sha256(sealed), schemaVersion: version, rowCount }).returning();
  await log(db, 'system', `${kind === 'nightly' ? 'Nightly' : 'Full'} backup made (${(sealed.length / 1024).toFixed(0)} KB, ${rowCount} rows) by ${by}`);
  return { ok: true as const, id: row!.id };
}

export const listBackups = (db: DbOrTx) => db.select().from(backup).orderBy(desc(backup.createdAt));

/**
 * Restore: checks the file is intact and from the same schema, then in one transaction drops the foreign keys, empties every table,
 * loads the backup, resets the ID counters and puts the foreign keys back (which re-checks them all). Everyone is signed out.
 */
export async function restoreBackup(db: Db, actor: AuditActor, id: number) {
  const [b] = await db.select().from(backup).where(eq(backup.id, id));
  if (!b) return { ok: false as const, error: 'That backup no longer exists' };
  const sealed = await readStored(b.storageKey).catch(() => null);
  if (!sealed || sha256(sealed) !== b.checksum) return { ok: false as const, error: 'The backup file is missing or damaged, so nothing was changed' };
  const doc = JSON.parse(openBackup(sealed).toString('utf8')) as { version: string; tables: Record<string, unknown[]> };
  if (doc.version !== (await schemaVersion(db))) return { ok: false as const, error: 'This backup was made with an older version of the system, so it can’t be restored here' };
  await db.transaction(async (tx) => {
    const fks = [...await tx.execute<{ tbl: string; name: string; def: string }>(sql`select conrelid::regclass::text as tbl, conname as name, pg_get_constraintdef(oid) as def
      from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`)];
    for (const f of fks) await tx.execute(sql`alter table ${sql.raw(f.tbl)} drop constraint ${sql.identifier(f.name)}`);
    const all = await tables(tx);
    await tx.execute(sql.raw(`truncate ${[...all, 'session'].map((t) => `"${t}"`).join(', ')}`));
    for (const t of all) {
      const rows = doc.tables[t];
      if (rows?.length) await tx.execute(sql`insert into ${sql.identifier(t)} select * from json_populate_recordset(null::${sql.identifier(t)}, ${JSON.stringify(rows)}::json)`);
    }
    const serials = await tx.execute<{ tbl: string; col: string }>(sql`select table_name as tbl, column_name as col from information_schema.columns
      where table_schema = 'public' and column_default like 'nextval(%'`);
    for (const s of serials) {
      if (SKIP.has(s.tbl)) continue;
      await tx.execute(sql`select setval(pg_get_serial_sequence(${`"${s.tbl}"`}, ${s.col}), coalesce((select max(${sql.identifier(s.col)}) from ${sql.identifier(s.tbl)}), 0) + 1, false)`);
    }
    for (const f of fks) await tx.execute(sql`alter table ${sql.raw(f.tbl)} add constraint ${sql.identifier(f.name)} ${sql.raw(f.def)}`);
    // The restored audit trail is the backup's, so this entry is added after it (with no login link: logins were replaced too).
    await audit(tx, { identityId: null, name: actor.name }, { action: `Restored the backup from ${b.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC; everyone was signed out`, page: 'Backup', entity: 'backup', entityId: id });
    await log(tx, 'system', `Restored backup #${id} (made by ${b.createdBy})`);
  });
  return { ok: true as const };
}

/** "Delete Backups Older than 30 days": removes the files and their rows. */
export async function deleteOldBackups(db: Db, actor: AuditActor, days = 30) {
  const old = await db.select().from(backup).where(lt(backup.createdAt, new Date(Date.now() - days * 86_400_000)));
  for (const b of old) {
    await removeStored(b.storageKey).catch(() => {});
    await db.delete(backup).where(eq(backup.id, b.id));
  }
  await audit(db, actor, { action: `Deleted ${old.length === 1 ? '1 backup' : `${old.length} backups`} older than ${days} days`, page: 'Backup', entity: 'backup' });
  return old.length;
}
