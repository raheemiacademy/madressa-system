import { notFound } from 'next/navigation';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { getContact } from '@/server/people/contacts';
import { ContactForm } from '../../ContactForm';

export const metadata = { title: 'Edit contact' };

export default async function EditContact({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('edit');
  const id = Number((await params).id);
  const c = Number.isInteger(id) ? await getContact(db, id) : null;
  if (!c) notFound();
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Edit {c.name}</h1><p>Contact #{c.id}</p></div></div>
      <ContactForm c={{ ...c, hasPassword: !!c.login?.passwordHash }} />
    </div>
  );
}
