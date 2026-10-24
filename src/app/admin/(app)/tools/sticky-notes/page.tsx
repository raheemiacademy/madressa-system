import Link from 'next/link';
import { db } from '@/db';
import { formatInstant } from '@/lib/dates';
import { plural } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { allNotes } from '@/server/sticky-notes';

export const metadata = { title: 'Sticky notes' };

export default async function StickyNotesPage() {
  await requireAdmin();
  const notes = await allNotes(db);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Sticky notes</h1><p>{notes.length ? `${plural(notes.length, 'note')} across the admin pages` : 'Notes added to any page appear here'}</p></div></div>
      <div className="ra-card">
        {notes.length === 0 ? <p className="ra-empty">Nothing here yet. Use the note button at the top of any page to add one.</p> : (
          <div className="ra-table-wrap" tabIndex={0}>
            <table className="ra-table">
              <thead><tr><th>Note</th><th>Page</th><th className="opt">Updated</th><th><span className="sr-only">Go</span></th></tr></thead>
              <tbody>
                {notes.map((n) => (
                  <tr key={n.id}>
                    <td className="wrap" style={{ maxWidth: '48ch' }}><span className="ra-chip" style={{ ['--c' as string]: `var(--ra-${n.colour})` }}><span>{n.colour}</span></span> {n.body}</td>
                    <td className="wrap ra-muted">{n.pagePath}</td>
                    <td className="opt ra-muted">{formatInstant(n.updatedAt, 'dd/MM/yyyy HH:mm')}</td>
                    <td><Link className="ra-link" href={n.pagePath}>Go to page</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
