import Link from 'next/link';

const ITEMS = [['/admin/tools/system', 'System'], ['/admin/tools/backups', 'Backups'], ['/admin/tools/logs', 'Logs'], ['/admin/tools/email', 'Email delivery'], ['/admin/tools/api', 'Developer API']] as const;

/** The System tools, side by side. */
export function OpsNav({ current }: { current: (typeof ITEMS)[number][0] }) {
  return (
    <nav className="ra-filters" aria-label="System tools">
      {ITEMS.map(([href, label]) => <Link key={href} className="ra-filter" href={href} aria-current={href === current ? 'page' : undefined}>{label}</Link>)}
    </nav>
  );
}
