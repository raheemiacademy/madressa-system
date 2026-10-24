import ReportSettings from '../[id]/page';

export const metadata = { title: 'New EOTY report' };

export default async function NewReport() {
  return ReportSettings({ params: Promise.resolve({ id: 'new' }) });
}
