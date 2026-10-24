import { redirect } from 'next/navigation';

// Email links point here; the inbox shows the thread beside the list.
export default async function ThreadLink({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/admin/messages?t=${Number((await params).id) || ''}`);
}
