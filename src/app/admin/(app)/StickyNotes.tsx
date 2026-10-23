'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { plural } from '@/lib/text';
import { PALETTE_COLOURS } from '@/settings/tabs';
import { addNoteAction, deleteNoteAction, loadNotes, updateNoteAction } from './shell-actions';

type Note = Awaited<ReturnType<typeof loadNotes>>[number];
const CHANGED = 'sticky-notes:changed';
const colourVar = (c: string) => `var(--ra-${c})`;

function useNotes() {
  const pathname = usePathname();
  const [notes, setNotes] = useState<Note[]>([]);
  const reload = useCallback(() => { loadNotes(pathname).then(setNotes).catch(() => setNotes([])); }, [pathname]);
  useEffect(() => {
    reload();
    window.addEventListener(CHANGED, reload);
    return () => window.removeEventListener(CHANGED, reload);
  }, [reload]);
  return { pathname, notes };
}

export function NotesStrip() {
  const { notes } = useNotes();
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  if (!notes.length) return null;
  const done = (r: { ok: boolean; error?: string }) => { if (r.ok) { setEditing(null); setError(''); window.dispatchEvent(new Event(CHANGED)); } else setError(r.error ?? 'That didn’t save.'); };
  return (
    <section className="ra-notes-strip no-print" aria-label="Sticky notes on this page">
      {error && <p className="ra-banner ra-alert" role="alert">{error}</p>}
      <div className="ra-notes">
        {notes.map((n) => (
          <article key={n.id} className="ra-note-card" style={{ ['--c' as string]: colourVar(n.colour) }}>
            {editing === n.id ? (
              <form onSubmit={(e) => { e.preventDefault(); const body = String(new FormData(e.currentTarget).get('body') ?? ''); start(async () => done(await updateNoteAction(n.id, body))); }}>
                <label className="sr-only" htmlFor={`note-${n.id}`}>Note</label>
                <textarea id={`note-${n.id}`} name="body" className="ra-textarea" defaultValue={n.body} maxLength={2000} autoFocus />
                <div className="ra-toolbar" style={{ marginTop: 6 }}>
                  <button className="ra-btn primary" disabled={pending}>Save</button>
                  <button type="button" className="ra-btn" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div>{n.body}</div>
                {n.canChange && (
                  <footer>
                    <span className="ra-acts">
                      <button type="button" aria-label="Edit note" onClick={() => setEditing(n.id)}><Icon name="edit" /></button>
                      <button type="button" aria-label="Delete note" disabled={pending}
                        onClick={() => { if (confirm('Delete this note?')) start(async () => done(await deleteNoteAction(n.id))); }}><Icon name="trash" /></button>
                    </span>
                  </footer>
                )}
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function NotesButton({ colours }: { colours: string[] }) {
  const { pathname, notes } = useNotes();
  const dlg = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const options = PALETTE_COLOURS.filter((c) => colours.includes(c.value));
  const choices = options.length ? options : PALETTE_COLOURS.slice(0, 1);
  // Name starts with the visible badge number so speech users can say what they see.
  const label = notes.length ? `${plural(notes.length, 'sticky note')} on this page. Add another` : 'Add a sticky note';
  return (
    <>
      <button type="button" className="ra-icon-btn" aria-label={label} title={label} onClick={() => { setError(''); dlg.current?.showModal(); }}>
        <Icon name="note" />
        {notes.length > 0 && <span className="ra-badge" aria-hidden="true">{notes.length}</span>}
      </button>
      <dialog ref={dlg} className="ra-dialog" aria-labelledby="note-dlg-h">
        <form className="ra-form" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const form = e.currentTarget;
          start(async () => {
            const r = await addNoteAction({ pagePath: pathname, body: String(fd.get('body') ?? ''), colour: String(fd.get('colour') ?? '') });
            if (!r.ok) { setError(r.error); return; }
            form.reset(); dlg.current?.close(); window.dispatchEvent(new Event(CHANGED));
          });
        }}>
          <div><h2 id="note-dlg-h">Add a sticky note</h2><p className="ra-note">It stays on this page for every admin.</p></div>
          {error && <p className="ra-banner ra-alert" role="alert">{error}</p>}
          <div className="ra-field"><label htmlFor="note-body">Note</label><textarea id="note-body" name="body" className="ra-textarea" required maxLength={2000} /></div>
          <fieldset className="ra-fieldset"><legend>Colour</legend>
            <div className="ra-checks">
              {choices.map((c, i) => (
                <label key={c.value} className="ra-check"><input type="radio" name="colour" value={c.value} defaultChecked={i === 0} />
                  <span><span className="ra-chip" style={{ ['--c' as string]: colourVar(c.value) }}><span>{c.label}</span></span></span></label>
              ))}
            </div>
          </fieldset>
          <div className="ra-toolbar">
            <button className="ra-btn primary" disabled={pending}>{pending ? 'Adding…' : 'Add note'}</button>
            <button type="button" className="ra-btn" onClick={() => dlg.current?.close()}>Cancel</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
