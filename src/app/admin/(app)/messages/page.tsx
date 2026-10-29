import Link from 'next/link';
import { asc, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { contact, teacher } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { ActionButton } from '@/components/Form';
import { Empty } from '@/components/Empty';
import { Reply } from '@/components/Reply';
import { RefreshOnce } from '@/components/RefreshOnce';
import { Ticks } from '@/components/Ticks';
import { Icon } from '@/components/Icon';
import { formatInstant } from '@/lib/dates';
import { initials } from '@/lib/text';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { inbox, markTeacherParentSeen, openThread, teacherParentNew, type InboxFilter } from '@/server/comm/messages';
import { bulkAction, deleteMessageAction, deleteThreadAction, replyAction } from './actions';
import { BulkForm } from './Bulk';

export const metadata = { title: 'Messages' };
const BOXES = { inbox: 'Inbox', locked: 'Locked (archived)', other: 'Teacher ↔ parent' } as const;
const WHO = { all: 'All', teachers: 'Teachers', contacts: 'Contacts', admins: 'Admins' } as const;
const ROLE: Record<string, string> = { admin: 'Admin', teacher: 'Teacher', contact: 'Contact' };

export default async function Messages({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const box = (sp.box && sp.box in BOXES ? sp.box : 'inbox') as InboxFilter['box'];
  const who = (sp.who && sp.who in WHO && sp.who !== 'all' ? sp.who : undefined) as InboxFilter['who'];
  // The search bar's filter is one value, "teacher:ID" or "contact:ID" (older links may still use teacher= or contact=).
  const [pk, pid] = (sp.person ?? '').split(':');
  const teacherId = (pk === 'teacher' ? Number(pid) : Number(sp.teacher)) || undefined;
  const contactId = (pk === 'contact' ? Number(pid) : Number(sp.contact)) || undefined;
  const f: InboxFilter = { box, who, teacherId, contactId, q: (sp.q ?? '').trim().slice(0, 60) || undefined };
  const me = { id: admin.staff.id, rank: admin.staff.rank, isSuper: admin.staff.isSuper };
  const tid = Number(sp.t) || null;
  // Open (and mark read) before listing, so the list doesn't show this conversation as unread.
  const open = tid ? await openThread(db, admin.staff.id, tid) : null;
  // Teacher → parent messages count as new until the admin opens this box.
  const newOther = box === 'other' ? 0 : await teacherParentNew(db, admin.staff.id);
  if (box === 'other') await markTeacherParentSeen(db, admin.staff.id);
  const [threads, teachers, contacts] = await Promise.all([
    inbox(db, me, f),
    db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt)).orderBy(asc(teacher.name)),
    db.select({ id: contact.id, name: contact.name }).from(contact).orderBy(asc(contact.name)).limit(2000)
  ]);
  const canEdit = adminCan(admin.staff, 'edit');
  const person = teacherId ? `teacher:${teacherId}` : contactId ? `contact:${contactId}` : undefined;
  const q = (v: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ box, who, person, q: f.q, ...v }).filter(([, x]) => x) as [string, string][])}`;
  const canDelete = adminCan(admin.staff, 'delete');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Messages</h1><p>Inbox for parents, teachers and admins</p></div>
        <div className="ra-toolbar">
          {canEdit && <Link className="ra-btn primary" href="/admin/messages/new"><Icon name="plus" />Compose</Link>}
          {adminCan(admin.staff, 'delete') && <Link className="ra-btn" href="/admin/messages/delete">Delete by date</Link>}
        </div></div>
      {/* Opening a conversation (or the teacher ↔ parent box) changes the header's counts: refresh them once. */}
      {(tid || box === 'other') && <RefreshOnce when={`${box}:${tid ?? ''}`} />}
      <nav className="ra-filters" aria-label="Mailbox">{Object.entries(BOXES).map(([k, l]) => (
        <Link key={k} className="ra-filter" aria-current={box === k ? 'page' : undefined} href={q({ box: k, t: undefined })}>{l}{k === 'other' && newOther > 0 && <> <b className="ra-msg-count">{newOther}<span className="sr-only"> new</span></b></>}</Link>
      ))}</nav>

      <form className="ra-card ra-msg-search" role="search">
        <input type="hidden" name="box" value={box} />
        <div className="ra-findbar"><Icon name="search" /><input className="ra-input" type="search" name="q" defaultValue={f.q ?? ''} placeholder="Search messages" aria-label="Search messages" enterKeyHint="search" /></div>
        <select className="ra-select" name="person" defaultValue={person ?? ''} aria-label="Filter by teacher or contact">
          <option value="">Everyone</option>
          <optgroup label="Teachers">{teachers.map((t) => <option key={t.id} value={`teacher:${t.id}`}>{t.name}</option>)}</optgroup>
          <optgroup label="Contacts">{contacts.map((c) => <option key={c.id} value={`contact:${c.id}`}>{c.name}</option>)}</optgroup>
        </select>
        <button className="ra-btn">Search</button>
        {(f.q || person) && <Link className="ra-link" href={`?box=${box}`}>Clear</Link>}
      </form>

      <div className="ra-grid">
        <section className="ra-card ra-c5" aria-label="Conversations">
          {box !== 'other' && <nav className="ra-filters" aria-label="Who">{Object.entries(WHO).map(([k, l]) => <Link key={k} className="ra-filter" aria-current={(who ?? 'all') === k ? 'page' : undefined} href={q({ who: k === 'all' ? undefined : k, t: undefined })}>{l}</Link>)}</nav>}
          {threads.length === 0 ? <p className="ra-empty">{box === 'locked' ? 'No locked conversations.' : box === 'other' ? 'No teacher ↔ parent conversations yet.' : 'Nothing here yet.'}</p> : (
            <BulkForm action={bulkAction} canDelete={canDelete}>
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
                      <span className="ra-msg-side">{formatInstant(t.lastMessageAt, 'dd/MM HH:mm')}{t.unreadCount > 0 && <span className="ra-msg-count">{t.unreadCount}<span className="sr-only"> unread</span></span>}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </BulkForm>
          )}
        </section>

        <section className="ra-card ra-c7" aria-labelledby="th-h">
          {!open ? <Empty icon="chat" href={canEdit ? '/admin/messages/new' : undefined} action="New message">Pick a conversation to read it.</Empty> : (
            <>
              <div className="ra-card-h"><div><h2 id="th-h">{open.thread.subject}</h2>
                <div className="ra-note">{open.people.map((p) => `${p.name} (${ROLE[p.kind]})`).join(', ')}{open.thread.faoRank ? ` · for ${open.thread.faoRank}` : ''}{open.thread.locked ? ' · locked: parents and teachers can’t reply' : ''}</div></div>
                {canDelete && <ActionButton action={deleteThreadAction.bind(null, open.thread.id)} label="Delete conversation" className="ra-btn" danger confirm={`Delete “${open.thread.subject}” for everyone?`} lose="Every message in it, and any attachments, will be gone for the parent or teacher and for every admin. This can’t be undone." />}</div>
              <div className="ra-thread">
                {open.messages.map((m) => (
                  <article key={m.id} aria-label={`From ${m.senderName} at ${m.at}`}>
                    <div className="ra-note ra-msg-meta"><span><b>{m.senderName}</b> · {ROLE[m.senderKind]} · {m.at}{m.senderKind === 'admin' && m.readBy.length + m.notReadBy.length > 0 && <> <Ticks read={m.notReadBy.length === 0} /></>}</span>
                      {canDelete && <span className="ra-acts"><ActionButton action={deleteMessageAction.bind(null, m.id)} ariaLabel={`Delete this message from ${m.senderName}`} confirm="Delete this message for everyone?" lose="It goes for the parent or teacher and for every admin. This can’t be undone." className="ra-del"><Icon name="trash" /></ActionButton></span>}</div>
                    <div className="ra-bubble" style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                    {m.attachmentFileId && <a className="ra-link" href={`/admin/files/${m.attachmentFileId}`}><Icon name="paperclip" /> Attachment</a>}
                    <div className="ra-note">{m.notReadBy.length ? `Not yet read${m.readBy.length ? `; read by ${m.readBy.join(', ')}` : ''}` : m.readBy.length ? `Read by ${m.readBy.join(', ')}` : ''}</div>
                  </article>
                ))}
              </div>
              {canEdit && open.thread.withOffice && (
                <Reply key={open.thread.id} action={replyAction.bind(null, open.thread.id)} me={admin.name} lockable attach />
              )}
              {!open.thread.withOffice && <p className="ra-note">This conversation is between a teacher and a parent. Admins can read it for oversight.</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
