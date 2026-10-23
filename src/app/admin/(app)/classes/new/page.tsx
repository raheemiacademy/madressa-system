import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { yearAndClasses } from '../../students/year-classes';
import { saveClassAction } from '../actions';
import { ClassFields } from '../ClassFields';

export const metadata = { title: 'Add class' };

export default async function NewClass() {
  await requireAdmin('edit');
  const { year } = await yearAndClasses();
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Add class</h1><p>{year ? `For ${year.title}. Use the year switcher to add it to another year.` : ''}</p></div></div>
      {!year ? <p className="ra-empty">Add an academic year first.</p> : (
        <Form action={saveClassAction.bind(null, undefined)} submit="Add class"><ClassFields yearId={year.id} yearStart={year.startsOn} yearEnd={year.endsOn} /></Form>
      )}
    </div>
  );
}
