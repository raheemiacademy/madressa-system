import Link from 'next/link';
import { asc, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { contact, teacher } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { SelectField, TextArea } from '@/components/Fields';
import { Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { formatInstant } from '@/lib/dates';
import { initials } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { inbox, openThread, type InboxFilter } from '@/server/comm/messages';
import { bulkAction, replyAction } from './actions';

export const metadata = { title: 'Messages' };
const BOXES = { inbox: 'Inbox', locked: 'Locked (archived)', other: 'Teacher ↔ parent' } as const;
const WHO = { all: 'All', teachers: 'Teachers', contacts: 'Contacts', admins: 'Admins' } as const;
const ROLE: Record<string, string> = { admin: 'Admin', teacher: 'Teacher', contact: 'Contact' };

export default async function Messages({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const box = (sp.box && sp.box in BOXES ? sp.box : 'inbox') as InboxFilter['box'];
  const who = (sp.who && sp.who in WHO && sp.who !== 'all' ? sp.who : undefined) as InboxFilter['who'];
  const f: InboxFilter = { box, who, teacherId: Number(sp.teacher) || undefined, contactId: Number(sp.contact) || undefined, q: (sp.q ?? '').trim().slice(0, 60) || undefined };
  const me = { id: admin.staff.id, rank: admin.staff.rank, isSuper: admin.staff.isSuper };
  const tid = Number(sp.t) || null;
  // Open (and mark read) before listing, so the list doesn't show this conversation as unread.
  const open = tid ? await openThread(db, admin.staff.id, tid) : null;
  const [threads, teachers, contacts] = await Promise.all([
    inbox(db, me, f),
    db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt)).orderBy(asc(teacher.name)),
    db.select({ id: contact.id, name: contact.name }).from(contact).orderBy(asc(contact.name)).limit(2000)
  ]);
  const canEdit = adminCan(admin.staff, 'edit');
  const q = (v: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ box, who, teacher: sp.teacher, contact: sp.contact, q: f.q, ...v }).filter(([, x]) => x) as [string, string][])}`;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Messages</h1><p>Inbox for parents, teachers and admins</p></div>
        <div className="ra-toolbar">
          {canEdit && <Link className="ra-btn primary" href="/admin/messages/new"><Icon name="plus" />Compose</Link>}
          {adminCan(admin.staff, 'delete') && <Link className="ra-btn" href="/admin/messages/delete">Delete by date</Link>}
        </div></div>
      <nav className="ra-filters" aria-label="Mailbox">{Object.entries(BOXES).map(([k, l]) => <Link key={k} className="ra-filter" aria-current={box === k ? 'page' : undefined} href={q({ box: k, t: undefined })}>{l}</Link>)}</nav>

      <details className="ra-card" open={!!(sp.teacher || sp.contact || sp.q)}>
        <summary className="ra-link" style={{ display: 'inline-grid' }}>Advanced search</summary>
        <form className="ra-toolbar" role="search">
          <input type="hidden" name="box" value={box} />
          <div className="ra-field"><label htmlFor="m-teacher">Teacher</label><select className="ra-select" id="m-teacher" name="teacher" defaultValue={sp.teacher ?? ''}><option value="">Any teacher</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div className="ra-field"><label htmlFor="m-contact">Contact</label><select className="ra-select" id="m-contact" name="contact" defaultValue={sp.contact ?? ''}><option value="">Any contact</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="ra-field grow"><label htmlFor="m-q">Words</label><input className="ra-input" id="m-q" type="search" name="q" defaultValue={f.q ?? ''} /></div>
          <button className="ra-btn">Search</button>
        </form>
      </details>

      <div className="ra-grid">
        <section className="ra-card ra-c5" aria-label="Conversations">
          {box !== 'other' && <nav className="ra-filters" aria-label="Who">{Object.entries(WHO).map(([k, l]) => <Link key={k} className="ra-filter" aria-current={(who ?? 'all') === k ? 'page' : undefined} href={q({ who: k === 'all' ? undefined : k, t: undefined })}>{l}</Link>)}</nav>}
          {threads.length === 0 ? <p className="ra-empty">{box === 'locked' ? 'No locked conversations.' : box === 'other' ? 'No teacher ↔ parent conversations yet.' : 'Nothing here yet.'}</p> : (
            <Form action={bulkAction} card={false} savebar={false} submit="Apply to selected">
              <ul className="ra-msg-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {threads.map((t) => (
                  <li key={t.id} className="ra-msg-row">
                    {canEdit && <input type="checkbox" name="ids" value={t.id} aria-label={`Select “${t.subject}”`} />}
                    <Link className="ra-msg" href={q({ t: String(t.id) })} aria-current={t.id === tid ? 'true' : undefined} data-unread={String(t.unread)}>
                      <span className="ra-avatar" aria-hidden="true">{initials(t.last?.name ?? t.others)}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="ra-msg-top"><span className="ra-msg-from">{t.others || 'Admins'}</span>{t.locked && <Chip colour="var(--color-fg-muted)">Locked</Chip>}</span>
                        <span className="ra-msg-subj" style={{ display: 'block' }}>{t.unread && <span className="sr-only">Unread: </span>}{t.subject}</span>
                        <span className="ra-msg-prev" style={{ display: 'block' }}>{t.last ? `${t.last.name}: ${t.last.body}` : ''}</span>
                      </span>
                      <span className="ra-msg-side">{formatInstant(t.lastMessageAt, 'dd/MM HH:mm')}<span className="ra-dot" aria-hidden="true" /></span>
                    </Link>
                  </li>
                ))}
              </ul>
              {canEdit && <SelectField name="op" label="Selected conversations" options={[{ value: 'read', label: 'Mark read' }, { value: 'unread', label: 'Mark unread' }, { value: 'lock', label: 'Archive (lock)' }, { value: 'unlock', label: 'Unlock' }, ...(adminCan(admin.staff, 'delete') ? [{ value: 'delete', label: 'Delete' }] : [])]} />}
            </Form>
          )}
        </section>

        <section className="ra-card ra-c7" aria-labelledby="th-h">
          {!open ? <p className="ra-empty">Choose a conversation to read it.</p> : (
            <>
              <div className="ra-card-h"><div><h2 id="th-h">{open.thread.subject}</h2>
                <div className="ra-note">{open.people.map((p) => `${p.name} (${ROLE[p.kind]})`).join(', ')}{open.thread.faoRank ? ` · for ${open.thread.faoRank}` : ''}{open.thread.locked ? ' · locked: parents and teachers can’t reply' : ''}</div></div></div>
              <div className="ra-thread">
                {open.messages.map((m) => (
                  <article key={m.id} aria-label={`From ${m.senderName} at ${m.at}`}>
                    <div className="ra-note" style={{ marginBottom: 4 }}><b>{m.senderName}</b> · {ROLE[m.senderKind]} · {m.at}</div>
                    <div className="ra-bubble" style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                    {m.attachmentFileId && <a className="ra-link" href={`/admin/files/${m.attachmentFileId}`}><Icon name="paperclip" /> Attachment</a>}
                    <div className="ra-note">{m.notReadBy.length ? `Not yet read${m.readBy.length ? `; read by ${m.readBy.join(', ')}` : ''}` : m.readBy.length ? `Read by ${m.readBy.join(', ')}` : ''}</div>
                  </article>
                ))}
              </div>
              {canEdit && open.thread.withOffice && (
                <Form action={replyAction.bind(null, open.thread.id)} card={false} savebar={false} submit="Reply" resetOnSuccess encType="multipart/form-data">
                  <TextArea name="body" label="Reply" rows={4} />
                  <div className="ra-field"><label htmlFor="r-att">Attach a file</label><input className="ra-input" id="r-att" name="attachment" type="file" style={{ paddingTop: 8 }} /></div>
                  <button className="ra-btn" name="lock" value="1">Reply &amp; lock</button>
                </Form>
              )}
              {!open.thread.withOffice && <p className="ra-note">This conversation is between a teacher and a parent. Admins can read it for oversight.</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
