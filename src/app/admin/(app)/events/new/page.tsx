import EventPage from '../[id]/page';

export const metadata = { title: 'Add event' };

export default async function NewEvent() {
  return EventPage({ params: Promise.resolve({ id: 'new' }) });
}
