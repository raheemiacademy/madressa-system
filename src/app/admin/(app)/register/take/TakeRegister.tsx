'use client';

import { useActionState, useState } from 'react';
import type { FormState } from '@/lib/validate';

type Mark = { mark: string; code: string | null; authorised: boolean | null; notified: boolean; lateMinutes: number | null; leftEarlyMinutes: number | null; note: string | null };
type Row = { id: number; name: string; hasMedical: boolean; mark: Mark | null; notice: { kind: string; reason: string | null; expectedArrival: string | null } | null };
type Code = { code: string; description: string; type: string };
const OPTS = [['present', 'P', 'Present'], ['late', 'L', 'Late'], ['absent', 'A', 'Absent'], ['left_early', 'E', 'Left early']] as const;

/** Entry mode, modelled on the TeacherRegister phone screen: P/L/A per student, live counts, one save. Teachers (office=false) don't decide authorisation. */
export function TakeRegister({ save, mode, codes, rows, office = true }: { save: (p: FormState, fd: FormData) => Promise<FormState>; mode: 'classic' | 'dfe'; codes: Code[]; rows: Row[]; office?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(save, undefined);
  // Parents' "absent today" notices pre-fill the register as notified absences until saved.
  const initial = (r: Row) => r.mark?.mark ?? (r.notice?.kind === 'absent' ? 'absent' : r.notice?.kind === 'late' ? 'late' : 'present');
  const [marks, setMarks] = useState<Record<number, string>>(() => Object.fromEntries(rows.map((r) => [r.id, initial(r)])));
  const [codeOf, setCodeOf] = useState<Record<number, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.mark?.code ?? (r.notice?.kind === 'absent' ? 'N' : '/')])));
  const count = (k: string) => Object.values(marks).filter((m) => m === k).length;
  const typeOf = (code: string) => codes.find((c) => c.code === code)?.type;
  return (
    <form action={action} className="ra-card ra-form" noValidate>
      <div role="status" aria-live="polite" className="ra-kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {mode === 'classic'
          ? [['Present', count('present') + count('left_early')], ['Late', count('late')], ['Absent', count('absent')]].map(([l, n]) => <div key={l} className="ra-kpi" style={{ padding: 10 }}><div className="ra-kpi-top">{l}</div><div style={{ fontSize: 20, fontWeight: 600 }}>{n}</div></div>)
          : [['Present', rows.filter((r) => ['present', 'approved'].includes(typeOf(codeOf[r.id]!) ?? '')).length], ['Absent', rows.filter((r) => ['authorised', 'unauthorised'].includes(typeOf(codeOf[r.id]!) ?? '')).length], ['Not counted', rows.filter((r) => typeOf(codeOf[r.id]!) === 'not_counted').length]].map(([l, n]) => <div key={l} className="ra-kpi" style={{ padding: 10 }}><div className="ra-kpi-top">{l}</div><div style={{ fontSize: 20, fontWeight: 600 }}>{n}</div></div>)}
      </div>
      {mode === 'classic' && <div><button type="button" className="ra-btn" onClick={() => setMarks(Object.fromEntries(rows.map((r) => [r.id, 'present'])))}>All present</button></div>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((r) => {
          const m = marks[r.id]!;
          return (
            <li key={r.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--ra-hairline)' }}>
              <input type="hidden" name="studentId" value={r.id} />
              <span style={{ flex: '1 1 12rem', minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 500, overflowWrap: 'anywhere' }}>{r.name}{r.hasMedical && <span className="ra-chip" style={{ ['--c' as string]: 'var(--color-bad)', marginLeft: 6 }}><span>Medical</span></span>}</span>
                {r.notice && <span className="ra-note" style={{ display: 'block', color: 'var(--ra-accent-text)' }}>Parent: {r.notice.kind === 'absent' ? 'absent today' : `running late${r.notice.expectedArrival ? `, about ${r.notice.expectedArrival.slice(0, 5)}` : ''}`}{r.notice.reason ? ` (${r.notice.reason})` : ''}</span>}
              </span>
              {mode === 'classic' ? (
                <>
                  <span className="ra-seg" role="radiogroup" aria-label={r.name}>
                    {OPTS.map(([k, letter, label]) => (
                      <label key={k} title={label}><input type="radio" name={`mark.${r.id}`} value={k} checked={m === k} aria-label={label} onChange={() => setMarks({ ...marks, [r.id]: k })} /><span className={letter}>{letter}</span></label>
                    ))}
                  </span>
                  {m === 'late' && <input className="ra-input" style={{ width: 120 }} name={`late.${r.id}`} inputMode="numeric" placeholder="Minutes late" aria-label={`Minutes late, ${r.name}`} defaultValue={r.mark?.lateMinutes ?? ''} />}
                  {m === 'left_early' && <input className="ra-input" style={{ width: 140 }} name={`left.${r.id}`} inputMode="numeric" placeholder="Minutes early" aria-label={`Minutes left early, ${r.name}`} defaultValue={r.mark?.leftEarlyMinutes ?? ''} />}
                  {office && (m === 'absent' || m === 'late') && (
                    <>
                      <select className="ra-select" name={`authorised.${r.id}`} aria-label={`Authorisation, ${r.name}`} defaultValue={r.mark?.authorised === true ? 'yes' : r.mark?.authorised === false ? 'no' : ''}>
                        <option value="">Authorisation not decided</option><option value="yes">Authorised</option><option value="no">Unauthorised</option>
                      </select>
                      <label className="ra-check"><input type="checkbox" name={`notified.${r.id}`} defaultChecked={r.mark?.notified ?? !!r.notice} /><span>Parent notified us</span></label>
                    </>
                  )}
                </>
              ) : (
                <>
                  <input type="hidden" name={`mark.${r.id}`} value={{ present: 'present', approved: 'present', authorised: 'absent', unauthorised: 'absent', not_counted: 'not_counted' }[typeOf(codeOf[r.id]!) ?? 'present'] ?? 'present'} />
                  <select className="ra-select" name={`code.${r.id}`} aria-label={`Attendance code, ${r.name}`} value={codeOf[r.id]} onChange={(e) => setCodeOf({ ...codeOf, [r.id]: e.target.value })}>
                    {codes.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.description}</option>)}
                  </select>
                </>
              )}
              <input className="ra-input" style={{ flex: '1 1 10rem', maxWidth: 260 }} name={`note.${r.id}`} placeholder="Note" aria-label={`Note, ${r.name}`} defaultValue={r.mark?.note ?? r.notice?.reason ?? ''} maxLength={500} />
            </li>
          );
        })}
      </ul>
      <div className="ra-savebar">
        <button className="ra-btn primary" disabled={pending}>{pending ? 'Saving…' : 'Save register'}</button>
        <span role="status" aria-live="polite" style={state?.ok ? undefined : { color: 'var(--color-bad)' }}>{pending ? '' : state?.message}</span>
      </div>
    </form>
  );
}
