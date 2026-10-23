import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { PrintButton } from '@/components/PrintButton';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { notesFor } from '@/server/people/extras';
import { getStudent } from '@/server/people/students';
import { getProfile } from '@/server/profile';

export const metadata = { title: 'Student notes' };

/** Print layout for "export notes as PDF" (browser Save as PDF). */
export default async function NotesPrint({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const s = Number.isInteger(id) ? await getStudent(db, id) : null;
  if (!s) notFound();
  const [notes, school] = await Promise.all([notesFor(db, id), getProfile(db)]);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Notes for {s.firstName} {s.surname}</h1><p>{school?.name} · Student #{s.id} · printed {formatInstant(new Date(), 'dd/MM/yyyy')}</p></div>
        <div className="ra-toolbar no-print"><Link className="ra-btn" href={`/admin/students/${id}`}>Back to profile</Link><PrintButton label="Print or save as PDF" /></div></div>
      <section className="ra-card">
        {notes.length === 0 ? <p className="ra-empty">No notes yet.</p> : notes.map((n) => (
          <article key={n.id} style={{ borderBottom: '1px solid var(--ra-hairline)', padding: '10px 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', breakInside: 'avoid' }}>
            <div className="ra-note" style={{ marginTop: 0 }}>{formatInstant(n.createdAt, 'dd/MM/yyyy HH:mm')}</div>{n.body}
          </article>
        ))}
      </section>
    </div>
  );
}
