import IncidentPage from '../[id]/page';

export const metadata = { title: 'Record an incident' };

export default async function NewIncident({ searchParams }: { searchParams: Promise<{ student?: string; class?: string }> }) {
  return IncidentPage({ params: Promise.resolve({ id: 'new' }), searchParams });
}
