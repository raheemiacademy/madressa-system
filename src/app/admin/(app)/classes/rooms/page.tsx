import { db } from '@/db';
import { TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listRooms, listSubjects } from '@/server/people/classes';
import { deleteNamedAction, saveRoomAction, saveSubjectAction } from '../actions';

export const metadata = { title: 'Classrooms & subjects' };

export default async function Rooms() {
  const admin = await requireAdmin();
  const [rooms, subjects] = await Promise.all([listRooms(db), listSubjects(db)]);
  const canEdit = adminCan(admin.staff, 'edit');
  const canDelete = adminCan(admin.staff, 'delete');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Classrooms &amp; subjects</h1><p>Used in timetables. Subjects are also used by exams and diaries.</p></div></div>
      <div className="ra-grid">
        <section className="ra-card ra-c6" aria-labelledby="rm-h">
          <div className="ra-card-h"><div><h2 id="rm-h">Classrooms and locations</h2></div></div>
          {rooms.length === 0 ? <p className="ra-empty">Nothing here yet.</p> : (
            <table className="ra-table"><tbody>{rooms.map((r) => (
              <tr key={r.id}><td className="wrap">{r.name}<div className="ra-note">{r.location ?? ''}</div></td>
                <td>{canDelete && <span className="ra-acts"><ActionButton className="" ariaLabel={`Delete ${r.name}`} action={deleteNamedAction.bind(null, 'classroom', r.id)} confirm={`Delete ${r.name}?`}><Icon name="trash" /></ActionButton></span>}</td></tr>
            ))}</tbody></table>
          )}
          {canEdit && <Form action={saveRoomAction.bind(null, undefined)} card={false} savebar={false} submit="Add classroom" resetOnSuccess>
            <div className="ra-fields"><TextField id="rn" name="name" label="Name" /><TextField id="rl" name="location" label="Location" /></div></Form>}
        </section>
        <section className="ra-card ra-c6" aria-labelledby="sb-h">
          <div className="ra-card-h"><div><h2 id="sb-h">Subjects</h2></div></div>
          {subjects.length === 0 ? <p className="ra-empty">Nothing here yet.</p> : (
            <table className="ra-table"><tbody>{subjects.map((s) => (
              <tr key={s.id}><td className="wrap">{s.name}<div className="ra-note">{s.description ?? ''}</div></td>
                <td>{canDelete && <span className="ra-acts"><ActionButton className="" ariaLabel={`Delete ${s.name}`} action={deleteNamedAction.bind(null, 'subject', s.id)} confirm={`Delete ${s.name}?`}><Icon name="trash" /></ActionButton></span>}</td></tr>
            ))}</tbody></table>
          )}
          {canEdit && <Form action={saveSubjectAction.bind(null, undefined)} card={false} savebar={false} submit="Add subject" resetOnSuccess>
            <div className="ra-fields"><TextField id="sn" name="name" label="Name" /><TextField id="sd" name="description" label="Description" /></div></Form>}
        </section>
      </div>
    </div>
  );
}
