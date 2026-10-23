import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Reuse one pool across hot reloads in dev.
const g = globalThis as unknown as { __sql?: postgres.Sql };
export const sql = g.__sql ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== 'production') g.__sql = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;
