import { Check, SelectField, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { addSlotAction, deleteSlotAction } from './actions';

export const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
type Slot = { s: { id: number; weekday: number; startTime: string; durationMinutes: number; takesRegister: boolean }; teacher: string | null; room: string | null; subject: string | null };
const end = (start: string, mins: number) => { const [h, m] = start.split(':').map(Number) as [number, number]; const t = h * 60 + m + mins; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

export function SlotList({ slots, canEdit }: { slots: Slot[]; canEdit: boolean }) {
  if (!slots.length) return <p className="ra-empty">No sessions yet.</p>;
  return (
    <table className="ra-table"><thead><tr><th>Day</th><th>Time</th><th className="opt">Teacher</th><th className="opt">Room</th><th>Subject</th><th className="opt">Register</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{slots.map(({ s, teacher, room, subject }) => (
        <tr key={s.id}><td>{WEEKDAYS[s.weekday]}</td><td>{s.startTime.slice(0, 5)}–{end(s.startTime, s.durationMinutes)}</td><td className="opt wrap">{teacher ?? ''}</td><td className="opt">{room ?? ''}</td><td className="wrap">{subject ?? ''}</td>
          <td className="opt">{s.takesRegister ? 'Yes' : 'No'}</td>
          <td>{canEdit && <span className="ra-acts"><ActionButton className="" ariaLabel={`Remove the ${WEEKDAYS[s.weekday]} ${s.startTime.slice(0, 5)} session`} action={deleteSlotAction.bind(null, s.id)} undo="Session removed."><Icon name="trash" /></ActionButton></span>}</td></tr>
      ))}</tbody></table>
  );
}

type Opt = { id: number; name: string };
export function SlotForm({ owner, teachers, rooms, subjects }: { owner: { classId: number } | { templateId: number }; teachers: Opt[]; rooms: Opt[]; subjects: Opt[] }) {
  const o = (xs: Opt[], none: string) => [{ value: '', label: none }, ...xs.map((x) => ({ value: String(x.id), label: x.name }))];
  return (
    <details><summary className="ra-link" style={{ display: 'inline-grid' }}>Add a session</summary>
      <Form action={addSlotAction.bind(null, owner)} card={false} savebar={false} submit="Add session">
        <div className="ra-fields">
          <SelectField name="weekday" label="Day" options={WEEKDAYS.slice(1).map((d, i) => ({ value: String(i + 1), label: d }))} />
          <TextField name="startTime" label="Start time" type="time" defaultValue="17:00" />
          <TextField name="hours" label="Hours" type="number" inputMode="numeric" min={0} max={12} defaultValue={2} />
          <TextField name="minutes" label="Minutes" type="number" inputMode="numeric" min={0} max={59} defaultValue={0} />
          <SelectField name="teacherId" label="Teacher" options={o(teachers, 'Not set')} />
          <SelectField name="classroomId" label="Room" options={o(rooms, 'Not set')} />
          <SelectField name="subjectId" label="Subject" options={o(subjects, 'Not set')} />
        </div>
        <Check name="takesRegister" label="Takes a register" defaultChecked />
      </Form>
    </details>
  );
}
