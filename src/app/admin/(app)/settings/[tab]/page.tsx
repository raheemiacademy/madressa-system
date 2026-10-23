import { notFound } from 'next/navigation';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { readTab } from '@/server/settings';
import { tabByKey } from '@/settings/tabs';
import { TabForm } from './TabForm';

export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }) {
  return { title: tabByKey((await params).tab)?.title ?? 'Settings' };
}

export default async function TabPage({ params }: { params: Promise<{ tab: string }> }) {
  await requireAdmin('super');
  const tab = tabByKey((await params).tab);
  if (!tab) notFound();
  const values = await readTab(db, tab.key);
  // Secrets never go to the browser — only whether one is saved.
  const safe = Object.fromEntries(tab.fields.map((f) => [f.name, f.type === 'secret' ? !!values[f.name] : values[f.name]]));
  return <TabForm tabKey={tab.key} values={safe} />;
}
