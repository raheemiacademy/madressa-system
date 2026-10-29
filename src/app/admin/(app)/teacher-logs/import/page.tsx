import { TextArea } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { importLogsAction } from '../actions';
import { FileDrop } from '@/components/FileDrop';

export const metadata = { title: 'Import teacher logs' };

export default async function ImportLogs() {
  await requireAdmin('edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Import teacher logs</h1><p>A CSV with the headings <code>teacher</code> (name or ID), <code>date</code> (DD/MM/YYYY), <code>time_in</code>, <code>time_out</code> and <code>absent</code> (yes or blank). Existing logs for the same day are replaced.</p></div></div>
      <Form action={importLogsAction} submit="Import logs">
        <FileDrop name="file" label="CSV file" accept=".csv,text/csv" />
        <TextArea name="paste" label="Or paste rows (with the heading row)" rows={6} spellCheck={false} />
      </Form>
    </div>
  );
}
