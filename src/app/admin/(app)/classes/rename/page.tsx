import { TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { yearAndClasses } from '../../students/year-classes';
import { renameClassesAction } from '../actions';

export const metadata = { title: 'Switch/rename classes' };

export default async function Rename() {
  await requireAdmin('edit');
  const { year, classes } = await yearAndClasses();
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Switch/rename classes</h1><p>Rename classes for {year?.title ?? 'this year'} in one go. To switch two classes, swap their names. Students stay where they are.</p></div></div>
      {classes.length === 0 ? <p className="ra-empty">No classes this year yet.</p> : (
        <Form action={renameClassesAction} submit="Save names">
          <div className="ra-fields">{classes.map((c) => <TextField key={c.c.id} id={`n${c.c.id}`} name={`name.${c.c.id}`} label={`Class #${c.c.id} (${c.students} students)`} defaultValue={c.c.name} />)}</div>
        </Form>
      )}
    </div>
  );
}
