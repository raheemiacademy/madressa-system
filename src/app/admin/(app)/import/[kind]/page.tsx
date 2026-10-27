import { isNull } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { teacher } from '@/db/schema';
import { SelectField } from '@/components/Fields';
import { requireAdmin } from '@/server/next/actor';
import { targetsFor } from '@/server/people/column-match';
import { COLUMNS, type ImportKind } from '@/server/people/imports';
import { listYearGroups } from '@/server/people/year-groups';
import { ImportFlow } from './ImportFlow';

export const metadata = { title: 'Import' };
const TITLE: Record<ImportKind, string> = { students: 'Import students', contacts: 'Import contacts', teachers: 'Import teachers', classes: 'Import classes' };

export default async function ImportPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin('edit');
  const kind = (await params).kind as ImportKind;
  if (!(kind in COLUMNS)) notFound();
  const edit = (await searchParams).edit === '1' && (kind === 'students' || kind === 'contacts');
  const cols = COLUMNS[kind];
  let extra: React.ReactNode = null;
  if (kind === 'classes') {
    const [groups, teachers] = await Promise.all([listYearGroups(db), db.select({ name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt))]);
    extra = (
      <>
        <div className="ra-field full"><label htmlFor="imp-quick">Or quick add: one class name per line</label><textarea className="ra-textarea" id="imp-quick" name="quick" rows={4} /></div>
        <SelectField name="defaultYearGroup" label="Quick add: age group" options={[{ value: '', label: 'None' }, ...groups.map((g) => ({ value: g.label, label: g.label }))]} />
        <SelectField name="defaultTeacher" label="Quick add: teacher" options={[{ value: '', label: 'None' }, ...teachers.map((t) => ({ value: t.name, label: t.name }))]} />
      </>
    );
  }
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{edit ? `Export/import edit: ${kind}` : TITLE[kind]}</h1>
        <p>{edit ? 'Download every record with its ID, change it in Excel, then upload it here. Rows with an ID update that record.' : 'Upload your own spreadsheet (CSV or Excel) or our template. You’ll match the columns, see a preview, and nothing is saved until you confirm.'}</p></div>
        <div className="ra-toolbar">
          <Link className="ra-btn" href="/admin/import/guide">Moving from another system?</Link>
          <a className="ra-btn" href={`/admin/import/${kind}/template`}>Download template</a>
          {(kind === 'students' || kind === 'contacts') && <a className="ra-btn" href={`/admin/import/${kind}/template?existing=1`}>Download existing {kind}</a>}
        </div></div>
      <details className="ra-card">
        <summary className="ra-link" style={{ display: 'inline-grid' }}>Columns explained</summary>
        <table className="ra-table"><thead><tr><th>Column</th><th>Notes</th></tr></thead>
          <tbody>{cols.map((c) => <tr key={c.name}><td><code>{c.name}</code>{c.required ? ' (required)' : ''}</td><td className="wrap" style={{ maxWidth: '60ch' }}>{c.help}</td></tr>)}</tbody></table>
        <p className="ra-note">Dates can be DD/MM/YYYY or YYYY-MM-DD. Columns you leave out are left blank (or unchanged when updating by ID).</p>
      </details>
      <ImportFlow kind={kind} extra={extra} targets={targetsFor(kind)} />
    </div>
  );
}
