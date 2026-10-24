import type { Metadata } from 'next';
import { ApplyPage } from '../ApplyPage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Adult application form' };

export default function Page() {
  return <ApplyPage kind="adult" />;
}
