'use client';

import { useActionState, useState, useTransition } from 'react';
import type { ImportKind } from '@/server/people/imports';
import { commitImport, previewImport, type ImportState } from './actions';

export function ImportFlow({ kind, extra }: { kind: ImportKind; extra?: React.ReactNode }) {
  const [state, preview, pending] = useActionState<ImportState, FormData>(previewImport.bind(null, kind), undefined);
  const [done, setDone] = useState<ImportState>();
  const [saving, start] = useTransition();
  const good = state?.results?.filter((r) => r.ok).length ?? 0;
  const bad = (state?.results?.length ?? 0) - good;
  if (done?.done) return <div className="ra-card"><p role="status" className="ra-banner ra-success" style={{ margin: 0 }}>Import finished: {done.done}</p></div>;
  return (
    <>
      <form action={preview} className="ra-card ra-form" noValidate>
        <div className="ra-card-h"><div><h2>1. Upload</h2><div className="ra-note">The first row must be the column headings from the template.</div></div></div>
        {state?.error && <p role="alert" className="ra-banner ra-alert" style={{ margin: 0 }}>{state.error}</p>}
        <div className="ra-fields">
          <div className="ra-field"><label htmlFor="imp-file">{kind === 'classes' ? 'CSV or Excel file' : 'CSV file'}</label>
            <input className="ra-input" id="imp-file" name="file" type="file" accept={kind === 'classes' ? '.csv,.xlsx,text/csv' : '.csv,text/csv'} style={{ paddingTop: 8 }} /></div>
          <div className="ra-field full"><label htmlFor="imp-paste">Or paste rows (with the heading row)</label><textarea className="ra-textarea" id="imp-paste" name="paste" rows={4} spellCheck={false} /></div>
          {extra}
        </div>
        <div className="ra-toolbar"><button className="ra-btn primary" disabled={pending}>{pending ? 'Checking…' : 'Check rows'}</button></div>
      </form>
      {state?.results && (
        <section className="ra-card" aria-labelledby="pv-h">
          <div className="ra-card-h"><div><h2 id="pv-h">2. Preview</h2><div className="ra-note" role="status">{good} ready, {bad} with problems. Rows with problems are skipped.</div></div></div>
          <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 460 }}><table className="ra-table">
            <thead><tr><th>Line</th><th>Row</th><th>Result</th></tr></thead>
            <tbody>{state.results.map((r) => (
              <tr key={r.line}><td className="ra-muted">{r.line}</td><td className="wrap">{r.summary || '(blank)'}{r.data?.id ? <span className="ra-muted"> · update #{String(r.data.id)}</span> : null}</td>
                <td className="wrap">{r.ok ? <span style={{ color: 'var(--color-ok)' }}>Ready</span> : <span style={{ color: 'var(--color-bad)' }}>{r.errors.join('; ')}</span>}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="ra-toolbar">
            <button className="ra-btn primary" disabled={!good || saving} onClick={() => start(async () => setDone(await commitImport(kind, state.rows!)))}>
              {saving ? 'Importing…' : `3. Import ${good === 1 ? '1 row' : `${good} rows`}`}</button>
          </div>
        </section>
      )}
    </>
  );
}
