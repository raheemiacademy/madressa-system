import { notFound } from 'next/navigation';
import { PRODUCT_NAME } from '@/lib/marketing';
import { Features } from '../_marketing/Features';
import { isMarketing, marketingMetadata } from '../_marketing/meta';

export const dynamic = 'force-dynamic';
export { generateViewport } from '../_marketing/meta';

export async function generateMetadata() {
  return marketingMetadata(`Features — ${PRODUCT_NAME}`,
    `Every part of ${PRODUCT_NAME}: students, registers, fees, messages, homework, reports, merits, events, safeguarding and the parent and teacher apps.`);
}

/** Only on the marketing copy; a madrasah's own copy has no such page. */
export default function Page() {
  if (!isMarketing()) notFound();
  return <Features />;
}
