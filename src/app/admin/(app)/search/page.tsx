import Link from 'next/link';
import { db } from '@/db';
import { Chip } from '@/components/Chip';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { globalSearch } from '@/server/people/search';

export const metadata = { title: 'Search' };

/** §1 global search results: students, contacts and teachers. */
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const q = ((await searchParams).q ?? '').trim().slice(0, 100);
  const r = await globalSearch(db, q);
  const total = r.students.length + r.contacts.length + r.teachers.length;
  const group = (title: string, n: number, body: React.ReactNode) => n > 0 && (
    <section className="ra-card" aria-label={title}><div className="ra-card-h"><div><h2>{title}</h2></div></div><ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{body}</ul></section>
  );
  const li = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--ra-hairline)', flexWrap: 'wrap' } as const;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Search</h1><p>{q ? <>Results for “{q}”</> : 'Find students, contacts and teachers'}</p></div></div>
      {!q && <div className="ra-card"><p className="ra-empty" role="status">Type a name, #ID, email or phone number in the search box. Press / to jump to it from any page.</p></div>}
      {q && total === 0 && <div className="ra-card"><p className="ra-empty" role="status">No students, contacts or teachers match “{q}”.</p></div>}
      {group('Students', r.students.length, r.students.map((s) => (
        <li key={s.id} style={li}><Link href={`/admin/students/${s.id}`}>{s.firstName} {s.surname}</Link><span className="ra-muted">#{s.id}{s.dob ? ` · ${formatCalendarDate(s.dob)}` : ''} <Chip>{s.status}</Chip></span></li>
      )))}
      {group('Contacts', r.contacts.length, r.contacts.map((c) => (
        <li key={c.id} style={li}><Link href={`/admin/contacts/${c.id}`}>{c.name}</Link><span className="ra-muted" style={{ overflowWrap: 'anywhere' }}>{[c.email, c.mobile].filter(Boolean).join(' · ')}</span></li>
      )))}
      {group('Teachers', r.teachers.length, r.teachers.map((t) => (
        <li key={t.id} style={li}><Link href={`/admin/teachers/${t.id}`}>{t.name}</Link><span className="ra-muted"><Chip>{t.status}</Chip></span></li>
      )))}
    </div>
  );
}
