import type { Metadata } from 'next';
import { ApplyPage } from './ApplyPage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Application form' };

export default function Page() {
  return <ApplyPage kind="child" />;
}
