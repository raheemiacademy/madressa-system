import { notFound } from 'next/navigation';
import { PRODUCT_NAME } from '@/lib/marketing';
import { Contact } from '../_marketing/Contact';
import { isMarketing, marketingMetadata } from '../_marketing/meta';

export const dynamic = 'force-dynamic';
export { generateViewport } from '../_marketing/meta';

export async function generateMetadata() {
  return marketingMetadata(`Contact — ${PRODUCT_NAME}`, `Talk to the ${PRODUCT_NAME} team by email, WhatsApp or the contact form.`);
}

/** Only on the marketing copy; a madrasah's own copy has no such page. */
export default function Page() {
  if (!isMarketing()) notFound();
  return <Contact />;
}
