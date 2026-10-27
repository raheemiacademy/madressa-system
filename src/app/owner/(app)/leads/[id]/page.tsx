import { LeadsView } from '../LeadsView';

export const metadata = { title: 'Lead' };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  return <LeadsView id={Number.isInteger(id) && id > 0 ? id : -1} />;
}
