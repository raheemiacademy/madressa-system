import Link from 'next/link';
import type { AdminActor } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';

/** The Newsletters area's sub-pages (Marketing access). SMS is hidden for now: WhatsApp replaces it (see FUTURE.md). */
export function CommTabs({ admin, current }: { admin: AdminActor; current: string }) {
  const tabs = [
    ...(adminCan(admin.staff, 'marketing') ? [['/admin/newsletters', 'Newsletters'], ['/admin/newsletters/files', 'Image manager']] : [])
  ];
  return <nav className="ra-filters" aria-label="Newsletters">{tabs.map(([h, l]) => <Link key={h} className="ra-filter" aria-current={current === h ? 'page' : undefined} href={h!}>{l}</Link>)}</nav>;
}
