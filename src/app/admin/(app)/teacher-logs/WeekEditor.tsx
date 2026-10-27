'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { LogRows, type LogRow } from './LogRows';

/** "Update this week": one line per teacher; pressing a name opens their days in a pop-up to update and save. */
export function WeekEditor({ rows }: { rows: LogRow[] }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [who, setWho] = useState<number | null>(null);
  const [done, setDone] = useState('');
  const teachers = [...new Map(rows.map((r) => [r.teacherId, r.name])).entries()].map(([id, name]) => {
    const mine = rows.filter((r) => r.teacherId === id);
    return { id, name, days: mine.length, logged: mine.filter((r) => r.timeIn || r.absent).length };
  });
  const open = teachers.find((t) => t.id === who);
  return (
    <>
      <ul className="ra-pick-rows">
        {teachers.map((t) => (
          <li key={t.id}>
            <button type="button" className="tap" onClick={() => { setWho(t.id); setDone(''); dlg.current?.showModal(); }}>
              <b>{t.name}</b><small>{t.logged} of {t.days === 1 ? '1 day' : `${t.days} days`} logged</small><Icon name="edit" />
            </button>
          </li>
        ))}
      </ul>
      {done && <p role="status" style={{ margin: 0 }}>{done}</p>}
      <dialog ref={dlg} className="ra-dialog" aria-labelledby="tl-h" style={{ width: 'min(860px, calc(100vw - 32px))' }}>
        {open && (
          <>
            <div className="ra-card-h"><div><h2 id="tl-h">{open.name}</h2><p className="ra-note" style={{ margin: 0 }}>Days they were due or have a log this week. Leave a day blank to remove its log.</p></div>
              <button type="button" className="ra-icon-btn" aria-label="Close" onClick={() => dlg.current?.close()}><span aria-hidden="true">×</span></button></div>
            <LogRows key={open.id} rows={rows.filter((r) => r.teacherId === open.id)} showTeacher={false} submit={`Save ${open.name.split(/\s+/)[0]}’s logs`}
              onSuccess={(s) => { setDone(`${open.name}: ${s.message ?? 'Saved.'}`); dlg.current?.close(); }} />
          </>
        )}
      </dialog>
    </>
  );
}
