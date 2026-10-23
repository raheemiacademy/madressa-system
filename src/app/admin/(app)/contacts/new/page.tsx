import { requireAdmin } from '@/server/next/actor';
import { ContactForm } from '../ContactForm';

export const metadata = { title: 'Add contact' };

export default async function NewContact() {
  await requireAdmin('edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Add contact</h1><p>Link them to students from the contact page or the student form.</p></div></div>
      <ContactForm />
    </div>
  );
}
