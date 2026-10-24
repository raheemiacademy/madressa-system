import Link from 'next/link';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { template } from '@/db/schema';
import { TEMPLATE_GROUPS, TEMPLATES } from '@/server/comm/templates';

export const metadata = { title: 'Templates' };

/** §19 Templates Editor: the school's email and PDF templates by group. */
export default async function Templates() {
  await requireAdmin('super');
  const edited = await db.select({ key: template.key, version: template.version }).from(template);
  return (
    <section className="ra-card" aria-labelledby="tp-h">
      <div className="ra-card-h"><div><h2 id="tp-h">Templates</h2><div className="ra-note">The wording of emails and PDFs the system sends. Add versions (for example “Urgent”) to choose between when sending. More groups arrive with their features.</div></div></div>
      {TEMPLATE_GROUPS.map((g) => (
        <div key={g}>
          <h3 style={{ fontSize: 15, margin: '12px 0 6px' }}>{g}</h3>
          <ul className="ra-list">{Object.entries(TEMPLATES).filter(([, t]) => t.group === g).map(([key, t]) => {
            const mine = edited.filter((e) => e.key === key);
            return <li key={key}><Link href={`/admin/settings/templates/${encodeURIComponent(key)}`}>{t.name}</Link>{t.pdf ? <span className="ra-muted"> · PDF</span> : null}
              {mine.length ? <span className="ra-muted"> · {mine.map((m) => m.version).join(', ')} edited</span> : null}</li>;
          })}</ul>
        </div>
      ))}
    </section>
  );
}
