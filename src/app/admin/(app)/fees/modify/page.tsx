import { INVOICE_TYPES } from '@/db/schema';
import { requireAdmin } from '@/server/next/actor';
import { yearAndClasses } from '../../students/year-classes';
import { FeesHead } from '../FeesHead';
import { ModifyForm } from './ModifyForm';

export const metadata = { title: 'Modify invoices' };

export default async function Modify() {
  await requireAdmin('fees');
  const { year } = await yearAndClasses();
  return (
    <div className="ra-page">
      <FeesHead title="Modify invoices" desc={`Change many invoices at once${year ? ` in ${year.title}` : ''}. Nothing changes until you’ve seen the preview.`} />
      {!year ? <p className="ra-empty">Add an academic year first.</p> : <ModifyForm types={INVOICE_TYPES} />}
    </div>
  );
}
