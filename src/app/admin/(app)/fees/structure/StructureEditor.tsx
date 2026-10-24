'use client';

import { useState } from 'react';
import { Checks, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { periodProblem, periodsEqually, periodsToMonthEnds, type IntervalUnit } from '@/lib/fees';
import { formatPence, parsePounds } from '@/lib/money';
import { saveStructureAction } from '../actions';

export type PeriodRow = { id: number | null; name: string; startsOn: string; endsOn: string; invoiceCount: string; intervalCount: string; intervalUnit: IntervalUnit; amount: string; startWeekday: string; dueRule: string };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DUE = [['start', 'Period start'], ['end', 'Period end'], ['2', '2nd day'], ['3', '3rd day'], ['5', '5th day'], ['7', '7th day'], ['14', '14th day'], ['21', '21st day']];
const monthName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });

export function StructureEditor({ id, name, kind, classIds, classes, periods: initial, yearStart, yearEnd }: {
  id: number | null; name: string; kind: 'class' | 'default' | 'adhoc'; classIds: string[]; classes: { value: string; label: string }[];
  periods: PeriodRow[]; yearStart: string; yearEnd: string;
}) {
  const blank = (p: Partial<PeriodRow> = {}): PeriodRow => ({ id: null, name: '', startsOn: yearStart, endsOn: yearEnd, invoiceCount: '1', intervalCount: '1', intervalUnit: 'months', amount: '', startWeekday: '', dueRule: 'start', ...p });
  const [rows, setRows] = useState<PeriodRow[]>(initial.length ? initial : [blank()]);
  const [k, setK] = useState(kind);
  const [n, setN] = useState('3');
  const set = (i: number, patch: Partial<PeriodRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const total = rows.reduce((s, r) => s + (Number(r.invoiceCount) || 0) * (parsePounds(r.amount) ?? 0), 0);
  // Helpers keep existing period IDs in order, so invoices already generated stay matched to their period.
  const reshape = (spans: { startsOn: string; endsOn: string }[], name: (s: { startsOn: string }, i: number) => string) =>
    setRows(spans.map((sp, i) => ({ ...(rows[i] ?? blank({ amount: rows[0]?.amount ?? '' })), ...sp, name: name(sp, i), invoiceCount: '1' })));
  return (
    <Form action={saveStructureAction.bind(null, id)} submit={id ? 'Save structure' : 'Create structure'}>
      <input type="hidden" name="periods" value={JSON.stringify(rows.map((r) => ({ ...r, id: r.id ?? undefined })))} />
      <div className="ra-fields">
        <TextField name="name" label="Structure name" defaultValue={name} />
        <SelectField name="kind" label="Applies to" value={k} onChange={(e) => setK(e.target.value as typeof k)}
          options={[{ value: 'class', label: 'Chosen classes' }, { value: 'default', label: 'Default (classes without their own)' }, { value: 'adhoc', label: 'Ad hoc (applied to single students)' }]} />
      </div>
      {k === 'class' && <Checks name="classIds" legend="Classes" options={classes} checked={classIds} help="A class can only have one structure; choosing it here moves it from any other." />}

      <fieldset className="ra-fieldset"><legend>Fee periods</legend>
        <div className="ra-toolbar" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="ra-btn" onClick={() => setRows([...rows, blank({ amount: rows.at(-1)?.amount ?? '' })])}>+ Add fees period</button>
          <button type="button" className="ra-btn" onClick={() => rows[0] && setRows(rows.map((r) => ({ ...r, invoiceCount: rows[0]!.invoiceCount, intervalCount: rows[0]!.intervalCount, intervalUnit: rows[0]!.intervalUnit, amount: rows[0]!.amount, startWeekday: rows[0]!.startWeekday, dueRule: rows[0]!.dueRule })))}>Auto-fill from the first period</button>
          <button type="button" className="ra-btn" onClick={() => setRows(rows.map((r) => ({ ...r, dueRule: 'start' })))}>Due dates to period start</button>
          <button type="button" className="ra-btn" onClick={() => setRows(rows.map((r) => ({ ...r, dueRule: 'end' })))}>Due dates to period end</button>
          <span className="ra-toolbar" style={{ gap: 6 }}>
            <label htmlFor="eq-n" className="ra-note">Periods</label>
            <input id="eq-n" className="ra-input" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} style={{ width: 64 }} />
            <button type="button" className="ra-btn" onClick={() => { const c = Math.min(60, Math.max(1, Number(n) || 1)); reshape(periodsEqually(yearStart, yearEnd, c), (_s, i) => `Period ${i + 1}`); }}>Generate periods equally</button>
          </span>
          <button type="button" className="ra-btn" onClick={() => reshape(periodsToMonthEnds(yearStart, yearEnd), (s) => monthName(s.startsOn))}>Generate periods to month ends</button>
        </div>
        {rows.length === 0 ? <p className="ra-empty">No periods yet. Add one to start billing.</p> : rows.map((r, i) => {
          const problem = r.startsOn && r.endsOn && Number(r.invoiceCount) > 0 && Number(r.intervalCount) > 0
            ? periodProblem({ ...r, invoiceCount: Number(r.invoiceCount), intervalCount: Number(r.intervalCount), startWeekday: r.startWeekday === '' ? null : Number(r.startWeekday) }) : null;
          const pence = parsePounds(r.amount);
          return (
            <div key={i} className="ra-period" role="group" aria-label={`Period ${i + 1}${r.name ? `: ${r.name}` : ''}`}>
              <div className="ra-fields">
                <TextField id={`p${i}-name`} name={`p${i}-name`} label="Name" value={r.name} onChange={(e) => set(i, { name: e.target.value })} help="e.g. 4 sessions" />
                <TextField id={`p${i}-start`} name={`p${i}-start`} label="Starts" type="date" value={r.startsOn} onChange={(e) => set(i, { startsOn: e.target.value })} />
                <TextField id={`p${i}-end`} name={`p${i}-end`} label="Ends" type="date" value={r.endsOn} onChange={(e) => set(i, { endsOn: e.target.value })} />
                <TextField id={`p${i}-count`} name={`p${i}-count`} label="Number of invoices" inputMode="numeric" value={r.invoiceCount} onChange={(e) => set(i, { invoiceCount: e.target.value })} />
                <TextField id={`p${i}-every`} name={`p${i}-every`} label="Every" inputMode="numeric" value={r.intervalCount} onChange={(e) => set(i, { intervalCount: e.target.value })} />
                <SelectField id={`p${i}-unit`} name={`p${i}-unit`} label="Interval" value={r.intervalUnit} onChange={(e) => set(i, { intervalUnit: e.target.value as IntervalUnit })} options={[{ value: 'days', label: 'Days' }, { value: 'weeks', label: 'Weeks' }, { value: 'months', label: 'Months' }]} />
                <TextField id={`p${i}-amount`} name={`p${i}-amount`} label="Amount per invoice (£)" inputMode="decimal" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} />
                <SelectField id={`p${i}-wd`} name={`p${i}-wd`} label="Period start" value={r.startWeekday} onChange={(e) => set(i, { startWeekday: e.target.value })} options={[{ value: '', label: 'The day it’s issued' }, ...WEEKDAYS.map((w, d) => ({ value: String(d), label: `First upcoming ${w}` }))]} />
                <SelectField id={`p${i}-due`} name={`p${i}-due`} label="Due date" value={r.dueRule} onChange={(e) => set(i, { dueRule: e.target.value })} options={DUE.map(([v, l]) => ({ value: v!, label: l! }))} />
              </div>
              <div className="ra-toolbar">
                <span className={problem ? 'ra-warn' : 'ra-note'} role={problem ? 'alert' : undefined}>{problem ?? (pence !== null ? `${r.invoiceCount || 0} × ${formatPence(pence)} = ${formatPence((Number(r.invoiceCount) || 0) * pence)}` : 'Enter an amount')}</span>
                <button type="button" className="ra-btn danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove period</button>
              </div>
            </div>
          );
        })}
        <p style={{ margin: 0 }}><b>Annual total per student: {formatPence(total)}</b></p>
      </fieldset>
    </Form>
  );
}
