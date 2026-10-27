import { redirect } from 'next/navigation';
import { PRODUCT_NAME } from '@/lib/marketing';
import { Home } from './_marketing/Home';
import { isMarketing, marketingMetadata } from './_marketing/meta';

export const dynamic = 'force-dynamic';
export { generateViewport } from './_marketing/meta';

export async function generateMetadata() {
  return marketingMetadata(`${PRODUCT_NAME} — run your madressa in one place`,
    'Registers, fees, parents and teachers in one system built for maktabs, mosques and Islamic schools. Free during early access.');
}

/** The public homepage on the marketing copy; on every madrasah's copy, / goes to the admin app as before. */
export default function Root() {
  if (!isMarketing()) redirect('/admin');
  return <Home />;
}
