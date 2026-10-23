import { inArray, or, sql } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { student, walkHomeConsent } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { TextArea, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { formatCalendarDate, formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { ageOn, todayIso } from '@/server/people/common';
import { answersFor, answerText } from '@/server/people/custom-fields';
import { filesFor, notesFor } from '@/server/people/extras';
import { loginFor } from '@/server/people/logins';
import { groupNamesFor } from '@/server/people/registration';
import { siblingsOf } from '@/server/people/siblings';
import { getStudent } from '@/server/people/students';
import { copyAddressAction } from '../../contacts/actions';
import {
  deleteAttachmentAction, deleteNoteAction, deleteOneStudentAction, saveNoteAction, setConsentAction, setLinkFlagsAction, unlinkContactAction, uploadAttachmentAction
} from '../actions';

export const metadata = { title: 'Student profile' };

export default async function StudentProfile({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  const s = Number.isInteger(id) ? await getStudent(db, id) : null;
  if (!s) notFound();
  const [notes, files, sibs, cf, login, groups, [consent]] = await Promise.all([
    notesFor(db, id), filesFor(db, id), siblingsOf(db, id), answersFor(db, 'student', id), loginFor(db, 'student', id), groupNamesFor(db, [id]),
    db.select().from(walkHomeConsent).where(sql`${walkHomeConsent.studentId} = ${id}`)
  ]);
  const sibIds = sibs.map((x) => (x.studentA === id ? x.studentB : x.studentA));
  const sibRows = sibIds.length ? await db.select({ id: student.id, firstName: student.firstName, surname: student.surname, status: student.status }).from(student).where(or(inArray(student.id, sibIds))) : [];
  const canEdit = adminCan(admin.staff, 'edit');
  const canDelete = adminCan(admin.staff, 'delete');
  const age = ageOn(s.dob, todayIso());
  const row = (k: string, v: React.ReactNode) => v ? <><dt>{k}</dt><dd>{v}</dd></> : null;

  return (
    <div className="ra-page">
      <div className="ra-page-h">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- private uploaded photo */}
          {s.photoFileId ? <img className="ra-photo" src={`/admin/files/${s.photoFileId}`} alt="" /> : null}
          <div><h1>{s.firstName} {s.surname}</h1><p>Student #{s.id} · <Chip>{s.status}</Chip> · {s.currentClasses.map((c) => c.c.name).join(', ') || 'No class'}</p></div>
        </div>
        <div className="ra-toolbar">
          {canEdit && <Link className="ra-btn primary" href={`/admin/students/${id}/edit`}><Icon name="edit" />Edit</Link>}
          <Link className="ra-btn" href={`/admin/students/${id}/history`}>Class history</Link>
          <Link className="ra-btn" href={`/admin/students/${id}/notes`}>Notes PDF</Link>
        </div>
      </div>

      <div className="ra-grid">
        <section className="ra-card ra-c6" aria-labelledby="d-h">
          <div className="ra-card-h"><div><h2 id="d-h">Details</h2></div></div>
          <dl className="ra-dl">
            {row('Date of birth', s.dob ? `${formatCalendarDate(s.dob)}${age !== null ? ` (age ${age})` : ''}` : null)}
            {row('Gender', s.gender)}
            {row('Start date', s.startDate && formatCalendarDate(s.startDate))}
            {row('Left date', s.leftDate && formatCalendarDate(s.leftDate))}
            {row('Telephone', s.tel)}{row('Mobile', s.mobile)}{row('Mobile 2', s.mobile2)}
            {row('Address', [s.address, s.postcode].filter(Boolean).join('\n'))}
            {row('Portal login', login ? `${login.email}${login.passwordHash ? '' : ' (no password set)'}` : null)}
            {row('Applied for', groups.map((g) => g.name).join(', '))}
            {row('Medical notes', s.medicalNotes)}
            {row('General notes', s.notes)}
            {cf.fields.map((f) => <span key={f.id} style={{ display: 'contents' }}>{row(f.label, answerText(cf.values[f.id]))}</span>)}
            {row('Walk-home consent', consent ? `Given ${formatInstant(consent.givenAt, 'dd/MM/yyyy')} (${consent.source === 'portal' ? 'parent portal' : 'recorded by staff'})` : 'Not given')}
          </dl>
          {canEdit && <div className="ra-toolbar"><ActionButton action={setConsentAction.bind(null, id, !consent)} label={consent ? 'Remove walk-home consent' : 'Record walk-home consent'} /></div>}
        </section>

        <section className="ra-card ra-c6" aria-labelledby="c-h">
          <div className="ra-card-h"><div><h2 id="c-h">Contacts</h2><div className="ra-note">Primary contact gets fees and portal messages first.</div></div>
            {canEdit && <Link className="ra-link" href={`/admin/students/${id}/edit`}>Manage contacts</Link>}</div>
          {s.contacts.length === 0 ? <p className="ra-empty">No contacts yet.</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {s.contacts.map(({ c, link }) => (
                <li key={c.id} className="ra-card" style={{ padding: 12, gap: 6, background: 'var(--ra-tint)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <Link href={`/admin/contacts/${c.id}`} style={{ fontWeight: 600, color: 'inherit', overflowWrap: 'anywhere' }}>{c.name}</Link>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Chip colour="var(--ra-indigo)">{link.type}</Chip>{link.isPrimary && <Chip colour="var(--color-ok)">Primary</Chip>}
                      {!link.portalAccess && <Chip colour="var(--color-fg-muted)">No portal access</Chip>}
                    </span>
                  </div>
                  <div className="ra-note">{[link.relation, c.mobile, c.email].filter(Boolean).join(' · ')}</div>
                  {canEdit && (
                    <div className="ra-toolbar">
                      {!link.isPrimary && <ActionButton className="ra-link" action={setLinkFlagsAction.bind(null, id, c.id, { isPrimary: true })} label="Make primary" />}
                      <ActionButton className="ra-link" action={setLinkFlagsAction.bind(null, id, c.id, { portalAccess: !link.portalAccess })} label={link.portalAccess ? 'Hide child on portal' : 'Show child on portal'} />
                      <ActionButton className="ra-link" action={copyAddressAction.bind(null, c.id, id)} label="Set student address to this" confirm={`Replace ${s.firstName}’s address with ${c.name}’s?`} />
                      <ActionButton className="ra-link" action={unlinkContactAction.bind(null, id, c.id)} label="Unlink" confirm={`Unlink ${c.name} from ${s.firstName}?`} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ra-card ra-c6" aria-labelledby="sib-h">
          <div className="ra-card-h"><div><h2 id="sib-h">Siblings</h2></div><Link className="ra-link" href="/admin/students/siblings">Manage siblings</Link></div>
          {sibRows.length === 0 ? <p className="ra-empty">No siblings recorded.</p> : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>{sibRows.map((x) => <li key={x.id}><Link href={`/admin/students/${x.id}`}>{x.firstName} {x.surname}</Link> <span className="ra-muted">({x.status})</span></li>)}</ul>
          )}
        </section>

        <section className="ra-card ra-c6" aria-labelledby="f-h">
          <div className="ra-card-h"><div><h2 id="f-h">Attachments</h2><div className="ra-note">Up to 10 MB, file types from Settings → File storage.</div></div></div>
          {files.length === 0 ? <p className="ra-empty">No files yet.</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {files.map(({ f }) => (
                <li key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--ra-hairline)' }}>
                  <a href={`/admin/files/${f.id}`} style={{ overflowWrap: 'anywhere' }}>{f.filename}</a>
                  <span className="ra-acts"><span className="ra-muted" style={{ fontSize: 12, alignSelf: 'center' }}>{Math.ceil(f.size / 1024).toLocaleString('en-GB')} KB</span>
                    {canDelete && <ActionButton className="" ariaLabel={`Delete ${f.filename}`} action={deleteAttachmentAction.bind(null, id, f.id)} confirm={`Delete ${f.filename}?`}><Icon name="trash" /></ActionButton>}</span>
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <Form action={uploadAttachmentAction.bind(null, id)} card={false} savebar={false} submit="Upload" resetOnSuccess>
              <TextField name="file" label="Add a file" type="file" style={{ paddingTop: 8 }} />
            </Form>
          )}
        </section>

        <section className="ra-card ra-c12" aria-labelledby="n-h">
          <div className="ra-card-h"><div><h2 id="n-h">Student notes</h2><div className="ra-note">Visible to admin staff only.</div></div><Link className="ra-link" href={`/admin/students/${id}/notes`}>Export as PDF</Link></div>
          {notes.length === 0 ? <p className="ra-empty">No notes yet.</p> : notes.map((n) => (
            <article key={n.id} className="ra-bubble" style={{ background: 'var(--ra-tint)', borderRadius: 12, padding: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              <div className="ra-note" style={{ marginTop: 0, marginBottom: 6 }}>{formatInstant(n.createdAt, 'dd/MM/yyyy HH:mm')}{n.updatedAt.getTime() - n.createdAt.getTime() > 1000 ? ' · edited' : ''}</div>
              {n.body}
              {canEdit && (
                <details style={{ marginTop: 8 }}>
                  <summary className="ra-link" style={{ display: 'inline-grid' }}>Edit</summary>
                  <Form action={saveNoteAction.bind(null, id, n.id)} card={false} savebar={false} submit="Save note">
                    <TextArea id={`note-${n.id}`} name="body" label="Note" defaultValue={n.body} rows={3} />
                  </Form>
                  {canDelete && <ActionButton className="ra-link" action={deleteNoteAction.bind(null, id, n.id)} label="Delete note" confirm="Delete this note?" danger />}
                </details>
              )}
            </article>
          ))}
          {canEdit && <Form action={saveNoteAction.bind(null, id, undefined)} card={false} savebar={false} submit="Add note" resetOnSuccess><TextArea name="body" label="New note" rows={3} /></Form>}
        </section>

        {canDelete && (
          <section className="ra-card ra-c12" aria-labelledby="del-h" style={{ borderColor: 'color-mix(in srgb, var(--color-bad) 40%, var(--color-border-line))' }}>
            <div className="ra-card-h"><div><h2 id="del-h">Delete this student</h2><div className="ra-note">Permanently removes the record, contact links, class history, notes and files. Usually you should set a leaving status instead.</div></div></div>
            <Form action={deleteOneStudentAction.bind(null, id)} card={false} savebar={false} submit="Delete permanently">
              <TextField name="confirmName" label="Type the school name to confirm" autoComplete="off" />
            </Form>
          </section>
        )}
      </div>
    </div>
  );
}
