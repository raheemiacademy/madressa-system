import { Check, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { redirect } from 'next/navigation';
import { bulkDeleteAction } from '../actions';
import { FeesHead } from '../FeesHead';

export const metadata = { title: 'Delete invoices' };

export default async function DeleteInvoices() {
  const admin = await requireAdmin('fees');
  if (!adminCan(admin.staff, 'delete')) redirect('/admin/no-access');
  return (
    <div className="ra-page">
      <FeesHead title="Delete invoices and payments" desc="Deletes invoices dated in a range, and optionally their payments. Deleted invoices are never generated again unless you force generate." />
      <Form action={bulkDeleteAction} submit="Delete">
        <div className="ra-fields">
          <TextField name="from" label="Invoice date from" type="date" />
          <TextField name="to" label="Invoice date to" type="date" />
          <TextField name="studentIds" label="Only these student IDs" help="Comma-separated. Leave blank for every student." full autoComplete="off" />
        </div>
        <Check name="includePayments" label="Also delete payments recorded against these invoices" />
        <TextField name="confirmName" label="Type the school name to confirm" autoComplete="off" />
      </Form>
    </div>
  );
}
