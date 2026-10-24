import Link from 'next/link';
import type { AdminActor } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';

/** The Newsletters & SMS area's sub-pages, shown by access level (Marketing for newsletters, Send SMS for texts). */
export function CommTabs({ admin, current }: { admin: AdminActor; current: string }) {
  const tabs = [
    ...(adminCan(admin.staff, 'marketing') ? [['/admin/newsletters', 'Newsletters'], ['/admin/newsletters/files', 'Image manager']] : []),
    ...(adminCan(admin.staff, 'sms') ? [['/admin/sms', 'Send SMS'], ['/admin/sms/templates', 'SMS templates'], ['/admin/sms/logs', 'SMS logs']] : [])
  ];
  return <nav className="ra-filters" aria-label="Newsletters and SMS">{tabs.map(([h, l]) => <Link key={h} className="ra-filter" aria-current={current === h ? 'page' : undefined} href={h!}>{l}</Link>)}</nav>;
}
