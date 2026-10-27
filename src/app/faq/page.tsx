import { notFound } from 'next/navigation';
import { PRODUCT_NAME } from '@/lib/marketing';
import { FaqPage } from '../_marketing/FaqPage';
import { isMarketing, marketingMetadata } from '../_marketing/meta';

export const dynamic = 'force-dynamic';
export { generateViewport } from '../_marketing/meta';

export async function generateMetadata() {
  return marketingMetadata(`FAQ — ${PRODUCT_NAME}`,
    `Answers about cost, early access, moving your data, UK GDPR, devices and everyday use of ${PRODUCT_NAME}.`);
}

/** Only on the marketing copy; a madrasah's own copy has no such page. */
export default function Page() {
  if (!isMarketing()) notFound();
  return <FaqPage />;
}
