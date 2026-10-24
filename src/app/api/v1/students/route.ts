import { db } from '@/db';
import { hitRateLimit } from '@/server/auth';
import { apiKeyFor, apiStudents } from '@/server/ops/system';

export const dynamic = 'force-dynamic';

/** §19 Developer API, read-only: GET /api/v1/students?page=1 with "Authorization: Bearer <key>" (scope: students). */
export async function GET(req: Request) {
  const k = await apiKeyFor(db, req.headers.get('authorization'), 'students');
  if (!k) return Response.json({ error: 'A valid API key with the students scope is needed' }, { status: 401 });
  if (!(await hitRateLimit(db, `api:${k.id}`, { hits: 120, windowMs: 60_000 }))) return Response.json({ error: 'Too many requests; try again in a minute' }, { status: 429 });
  const page = Math.max(1, Math.min(10_000, Number(new URL(req.url).searchParams.get('page')) || 1));
  return Response.json(await apiStudents(db, page), { headers: { 'cache-control': 'no-store' } });
}
