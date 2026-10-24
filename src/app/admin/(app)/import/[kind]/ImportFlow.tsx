'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import type { ImportKind } from '@/server/people/imports';
import { commitImport, previewImport, previewMatched, type ImportState } from './actions';

type Actions = { preview: (p: ImportState, fd: FormData) => Promise<ImportState>; commit: (rows: Record<string, string>[]) => Promise<ImportState> };
type Target = { value: string; label: string };

/** Upload → (match their columns) → preview → import. Fees import passes its own actions; the people imports use the defaults. */
export function ImportFlow({ kind, extra, actions, targets = [] }: { kind: ImportKind | 'fees'; extra?: React.ReactNode; actions?: Actions; targets?: Target[] }) {
  const [uploaded, preview, pending] = useActionState<ImportState, FormData>(actions?.preview ?? previewImport.bind(null, kind as ImportKind), undefined);
  const [checked, setChecked] = useState<ImportState>();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [done, setDone] = useState<ImportState>();
  const [saving, start] = useTransition();
  const [matching, startMatch] = useTransition();
  useEffect(() => { setChecked(undefined); setMapping(uploaded?.match?.mapping ?? {}); }, [uploaded]);
  const state = checked ?? uploaded;
  const good = state?.results?.filter((r) => r.ok).length ?? 0;
  const bad = (state?.results?.length ?? 0) - good;
  const match = uploaded?.match;
  if (done?.done) return <div className="ra-card"><p role="status" className="ra-banner ra-success" style={{ margin: 0 }}>Import finished: {done.done}</p></div>;
  return (
    <>
      <form action={preview} className="ra-card ra-form" noValidate>
        <div className="ra-card-h"><div><h2>1. Upload</h2><div className="ra-note">{kind === 'fees' ? 'The first row must be the column headings from the template.' : 'Use our template, or your own spreadsheet: the first row must be its column headings, and you’ll match them up next.'}</div></div></div>
        {uploaded?.error && !checked && <p role="alert" className="ra-banner ra-alert" style={{ margin: 0 }}>{uploaded.error}</p>}
        <div className="ra-fields">
          <div className="ra-field"><label htmlFor="imp-file">CSV or Excel file</label>
            <input className="ra-input" id="imp-file" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ paddingTop: 8 }} /></div>
          <div className="ra-field full"><label htmlFor="imp-paste">Or paste rows (with the heading row)</label><textarea className="ra-textarea" id="imp-paste" name="paste" rows={4} spellCheck={false} /></div>
          {extra}
        </div>
        <div className="ra-toolbar"><button className="ra-btn primary" disabled={pending}>{pending ? 'Reading…' : 'Next'}</button></div>
      </form>
      {match && (
        <section className="ra-card" aria-labelledby="mt-h">
          <div className="ra-card-h"><div><h2 id="mt-h">2. Match your columns</h2>
            <div className="ra-note">We’ve guessed where each of your columns goes. Check them, change any that are wrong, and choose “Don’t import” for columns you don’t need. {match.raw.length === 1 ? '1 row' : `${match.raw.length} rows`} found.</div></div></div>
          {checked?.error && <p role="alert" className="ra-banner ra-alert" style={{ margin: 0 }}>{checked.error}</p>}
          <div className="ra-table-wrap" tabIndex={0} role="region" aria-label="Your columns">
            <table className="ra-table">
              <thead><tr><th>Your column</th><th>Example from your file</th><th>Goes into</th></tr></thead>
              <tbody>
                {match.headers.map((h, i) => (
                  <tr key={h}>
                    <td className="wrap"><b>{h.replace(/_/g, ' ')}</b></td>
                    <td className="wrap ra-muted">{match.raw.find((r) => r[h])?.[h] ?? '(empty)'}</td>
                    <td>
                      <select className="ra-select" aria-label={`Where “${h.replace(/_/g, ' ')}” goes`} id={`map-${i}`} value={mapping[h] ?? ''} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>
                        {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ra-toolbar">
            <button type="button" className="ra-btn primary" disabled={matching} onClick={() => startMatch(async () => setChecked(await previewMatched(kind as ImportKind, match.raw, mapping)))}>{matching ? 'Checking…' : 'Check rows'}</button>
          </div>
        </section>
      )}
      {state?.results && (
        <section className="ra-card" aria-labelledby="pv-h">
          <div className="ra-card-h"><div><h2 id="pv-h">{match ? '3' : '2'}. Preview</h2><div className="ra-note" role="status">{good} ready, {bad} with problems. Rows with problems are skipped.</div></div></div>
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 460 }}><table className="ra-table">
            <thead><tr><th>Line</th><th>Row</th><th>Result</th></tr></thead>
            <tbody>{state.results.map((r) => (
              <tr key={r.line}><td className="ra-muted">{r.line}</td><td className="wrap">{r.summary || '(blank)'}{r.data?.id ? <span className="ra-muted"> · update #{String(r.data.id)}</span> : null}</td>
                <td className="wrap">{r.ok ? <span style={{ color: 'var(--color-ok)' }}>Ready</span> : <span style={{ color: 'var(--color-bad)' }}>{r.errors.join('; ')}</span>}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="ra-toolbar">
            <button className="ra-btn primary" disabled={!good || saving} onClick={() => start(async () => setDone(await (actions ? actions.commit(state.rows!) : commitImport(kind as ImportKind, state.rows!))))}>
              {saving ? 'Importing…' : `${match ? '4' : '3'}. Import ${good === 1 ? '1 row' : `${good} rows`}`}</button>
          </div>
        </section>
      )}
    </>
  );
}
