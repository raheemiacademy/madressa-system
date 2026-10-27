'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatPence } from '@/lib/money';

export type Row = {
  name: string; host: string; version: string | null; status: 'up' | 'down' | 'missed' | 'waiting'; attention: string | null;
  students: number | null; teachers: number | null; parents: number | null; parentsWithLogin: number | null;
  lastActive: string; quietDays: number; backup: string; backupOk: boolean; score: number;
  fees: { collected: number; invoiced: number } | null; // this month, pence
};
const nf = new Intl.NumberFormat('en-GB');
const n = (v: number | null) => v == null ? '—' : nf.format(v);
const SORTS = [['attention', 'Needs attention'], ['least', 'Least active'], ['biggest', 'Biggest']] as const;

function Status({ r }: { r: Row }) {
  if (r.status === 'down') return <span className="status bad">Down</span>;
  if (r.status === 'waiting') return <span className="status off">Not checked yet</span>;
  if (r.attention) return <span className="status warn">Needs a look</span>;
  return <span className="status">Running</span>;
}

/** The madrasahs as a table on a laptop and cards on a phone, sorted three ways. */
export function MadrasahList({ rows }: { rows: Row[] }) {
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>('attention');
  const M = [...rows].sort(sort === 'attention' ? (a, b) => b.score - a.score : sort === 'least' ? (a, b) => b.quietDays - a.quietDays : (a, b) => (b.students ?? -1) - (a.students ?? -1));
  const href = (r: Row) => `/owner/madrasahs/${encodeURIComponent(r.name)}`;
  const fees = (r: Row) => r.fees ? <div className="fees"><span>{formatPence(r.fees.collected)} <span className="muted">of {formatPence(r.fees.invoiced)}</span></span>
    <span className="meter"><i style={{ width: `${Math.min(100, r.fees.invoiced ? (r.fees.collected / r.fees.invoiced) * 100 : 0)}%` }} /></span></div> : <span className="muted">—</span>;
  const backup = (r: Row) => r.backupOk ? r.backup : <span className="status bad">{r.backup}</span>;
  return (
    <>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Sort">
          {SORTS.map(([k, label]) => <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>{label}</button>)}
        </div>
        <span className="note" style={{ marginLeft: 'auto' }}>{n(rows.length)} {rows.length === 1 ? 'madrasah' : 'madrasahs'} · fees are this month, collected of invoiced</span>
      </div>
      <section className="card tbl-or-cards" aria-label="Madrasahs">
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Madrasahs table">
          <table className="t">
            <thead><tr><th scope="col">Madrasah</th><th scope="col">Status</th><th scope="col" className="r">Students</th><th scope="col" className="r">Teachers</th><th scope="col" className="r">Parents in</th><th scope="col">Last active</th><th scope="col">Last backup</th><th scope="col">Fees this month</th></tr></thead>
            <tbody>{M.map((r) => (
              <tr key={r.name}>
                <td><Link className="name" href={href(r)} translate="no">{r.name}</Link><span className="addr">{r.host}</span>{r.attention && <span className="addr warn-text">{r.attention}</span>}</td>
                <td><Status r={r} />{r.version && <span className="addr">v{r.version}</span>}</td>
                <td className="r">{n(r.students)}</td><td className="r">{n(r.teachers)}</td>
                <td className="r">{n(r.parentsWithLogin)}{r.parents !== null && <span className="addr">of {n(r.parents)}</span>}</td>
                <td className="nw">{r.lastActive}</td><td className="nw">{backup(r)}</td><td>{fees(r)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mcards">{M.map((r) => (
          <Link key={r.name} className="mcard" href={href(r)}>
            <div className="mcard-h"><div style={{ minWidth: 0 }}><b translate="no">{r.name}</b><div className="addr">{r.host}{r.version && ` · v${r.version}`}</div></div><Status r={r} /></div>
            {r.attention && <div className="note warn-text">{r.attention}</div>}
            <div className="facts"><div><small>Students</small><strong>{n(r.students)}</strong></div><div><small>Teachers</small><strong>{n(r.teachers)}</strong></div><div><small>Parents in</small><strong>{n(r.parentsWithLogin)}</strong></div></div>
            <div className="note">Active {r.lastActive.replace(/^Never$/, 'never')} · Backup {r.backup}</div>
            {r.fees && fees(r)}
          </Link>
        ))}</div>
      </section>
    </>
  );
}
