import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminStaff } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { formatCalendarDate } from '@/lib/dates';
import { LATEST, RELEASES } from '@/lib/releases';
import { requireAdmin } from '@/server/next/actor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'What’s new' };
const KIND: Record<string, [string, string]> = { new: ['New', 'var(--ra-indigo)'], better: ['Better', 'var(--ra-blue)'], fixed: ['Fixed', 'var(--color-ok)'], removed: ['Removed', 'var(--color-fg-muted)'] };

/** What's new: every update in plain language. Opening it marks the latest as read for this person. */
export default async function WhatsNew() {
  const admin = await requireAdmin();
  const unseen = admin.staff.seenRelease !== LATEST.version;
  if (unseen) await db.update(adminStaff).set({ seenRelease: LATEST.version }).where(eq(adminStaff.id, admin.staff.id));
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>What’s new</h1><p>You’re on version {LATEST.version}. Updates are installed for you automatically; this page explains what each one changes.</p></div></div>
      {RELEASES.map((r, i) => (
        <section key={r.version} className="ra-card ra-release" aria-labelledby={`rel-${r.version}`}>
          <div className="ra-card-h"><div>
            <h2 id={`rel-${r.version}`}>{r.title} {i === 0 && unseen && <Chip colour="var(--ra-violet)">New</Chip>}</h2>
            <div className="ra-note">Version {r.version} · {formatCalendarDate(r.date, 'd MMMM yyyy')}</div>
          </div></div>
          <p style={{ margin: '0 0 10px' }}>{r.summary}</p>
          <ul>{r.changes.map((c, n) => <li key={n}><Chip colour={KIND[c.kind]![1]}>{KIND[c.kind]![0]}</Chip> <span>{c.text}</span></li>)}</ul>
        </section>
      ))}
    </div>
  );
}
