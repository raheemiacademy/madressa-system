import { db } from '@/db';
import { getAdmin } from '@/server/next/actor';
import { paragraphs } from '@/server/learning/eoty';

/** "Backup" of the 15 paragraph templates as a JSON file, restorable on the same page. */
export async function GET() {
  if (!(await getAdmin())) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(await paragraphs(db), null, 2), { headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="eoty-paragraphs.json"', 'cache-control': 'no-store' } });
}
