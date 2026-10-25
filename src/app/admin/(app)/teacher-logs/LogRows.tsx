import { Form } from '@/components/Form';
import type { FormState } from '@/lib/validate';
import { saveLogsAction } from './actions';

export type LogRow = { teacherId: number; name: string; date: string; timeIn: string; timeOut: string; absent: boolean; note: string; expected?: string };
const d = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** An editable list of teacher-day logs (absent flag, time in, time out, note). Blank rows are removed on save. */
export function LogRows({ rows, submit = 'Save logs', showTeacher = true, onSuccess }: { rows: LogRow[]; submit?: string; showTeacher?: boolean; onSuccess?: (s: NonNullable<FormState>) => void }) {
  if (!rows.length) return <p className="ra-empty">Nothing to show.</p>;
  return (
    <Form action={saveLogsAction} card={false} submit={submit} onSuccess={onSuccess}>
      <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 620 }}><table className="ra-table">
        <thead><tr>{showTeacher && <th>Teacher</th>}<th>Day</th><th className="opt">Expected</th><th>Absent</th><th>Time in</th><th>Time out</th><th className="opt">Note</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={`${r.teacherId}-${r.date}`}>
            {showTeacher && <td className="wrap">{r.name}</td>}
            <td>{d(r.date)}<input type="hidden" name={`row.${i}.teacherId`} value={r.teacherId} /><input type="hidden" name={`row.${i}.date`} value={r.date} /></td><td className="opt ra-muted">{r.expected ?? ''}</td>
            <td><input type="checkbox" name={`row.${i}.absent`} defaultChecked={r.absent} aria-label={`${r.name} absent on ${r.date}`} /></td>
            <td><input className="ra-input" style={{ width: 120 }} type="time" name={`row.${i}.timeIn`} defaultValue={r.timeIn} aria-label={`${r.name} time in on ${r.date}`} /></td>
            <td><input className="ra-input" style={{ width: 120 }} type="time" name={`row.${i}.timeOut`} defaultValue={r.timeOut} aria-label={`${r.name} time out on ${r.date}`} /></td>
            <td className="opt"><input className="ra-input" style={{ minWidth: 140 }} name={`row.${i}.note`} defaultValue={r.note} maxLength={300} aria-label={`${r.name} note on ${r.date}`} /></td>
          </tr>
        ))}</tbody>
      </table></div>
    </Form>
  );
}
