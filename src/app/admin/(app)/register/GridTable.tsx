'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { LETTER_NAMES } from '@/lib/attendance';
import { decideOneAction } from './actions';

type Cell = { id: number; letter: string; mark: string; authorised: boolean | null; notified: boolean; note: string | null; lateMinutes: number | null };
type Row = { id: number; name: string; cells: Record<string, Cell[]>; pct: string };
type Day = { date: string; closed: { kind: 'H' | 'C'; title: string } | null };
const head = (d: string) => { const dt = new Date(`${d}T12:00:00Z`); return [dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), dt.getUTCDate()]; };

export function GridTable({ days, rows, canEdit, classId }: { days: Day[]; rows: Row[]; canEdit: boolean; classId: number }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [cur, setCur] = useState<{ cell: Cell; name: string; date: string } | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const open = (cell: Cell, name: string, date: string) => { setCur({ cell, name, date }); setError(''); dlg.current?.showModal(); };
  const decide = (authorised: 'yes' | 'no') => {
    if (!cur) return;
    const note = (dlg.current?.querySelector('textarea') as HTMLTextAreaElement | null)?.value ?? '';
    start(async () => { const r = await decideOneAction(cur.cell.id, authorised, note); if (r.error) setError(r.error); else dlg.current?.close(); });
  };
  if (!rows.length) return <p className="ra-empty">No students in this class this month.</p>;
  return (
    <>
      <div className="ra-table-wrap" tabIndex={0}><table className="ra-table ra-reg">
        <thead><tr><th>Student</th>{days.map((d) => { const [w, n] = head(d.date); return <th key={d.date} className="m" scope="col">{canEdit && !d.closed ? <Link href={`/admin/register/take?class=${classId}&date=${d.date}`} style={{ color: 'inherit' }}>{w}<br />{n}<span className="sr-only">, take the register</span></Link> : <>{w}<br />{n}</>}</th>; })}<th className="num">%</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td className="wrap"><Link href={`/admin/register/student/${r.id}`} style={{ color: 'inherit' }}>{r.name}</Link></td>
            {days.map((d) => {
              const cells = r.cells[d.date] ?? [];
              if (d.closed && !cells.length) return <td key={d.date} className="m"><span className={`ra-mk ra-mk-${d.closed.kind}`} title={d.closed.title}>{d.closed.kind}</span></td>;
              return (
                <td key={d.date} className="m">{cells.map((c) => {
                  const k = /^[PLANUE]$/.test(c.letter) ? c.letter : 'X';
                  const label = `${r.name}, ${d.date}: ${LETTER_NAMES[c.letter] ?? c.letter}${c.note ? `, ${c.note}` : ''}`;
                  return canEdit && (c.mark === 'absent' || c.mark === 'late')
                    ? <button key={c.id} type="button" className={`ra-mk ra-mk-${k}`} aria-label={label} title={label} onClick={() => open(c, r.name, d.date)}>{c.letter}</button>
                    : <span key={c.id} className={`ra-mk ra-mk-${k}`} title={label} aria-label={label} role="img">{c.letter}</span>;
                })}</td>
              );
            })}
            <td className="num">{r.pct}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <dialog ref={dlg} className="ra-dialog" aria-labelledby="abs-h">
        {cur && (
          <div className="ra-form">
            <div><h2 id="abs-h">{cur.cell.mark === 'late' ? 'Late' : 'Absence'}: {cur.name}</h2><p className="ra-note">{cur.date}{cur.cell.lateMinutes ? ` · ${cur.cell.lateMinutes} minutes late` : ''}{cur.cell.notified ? ' · parent notified the school' : ''}</p></div>
            {error && <p className="ra-banner ra-alert" role="alert">{error}</p>}
            <div className="ra-field"><label htmlFor="abs-note">Note or reason</label><textarea id="abs-note" className="ra-textarea" defaultValue={cur.cell.note ?? ''} maxLength={500} /></div>
            <div className="ra-toolbar">
              <button className="ra-btn primary" disabled={pending} onClick={() => decide('yes')}>Authorised</button>
              <button className="ra-btn" disabled={pending} onClick={() => decide('no')}>Unauthorised</button>
              <button className="ra-btn" onClick={() => dlg.current?.close()}>Cancel</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
