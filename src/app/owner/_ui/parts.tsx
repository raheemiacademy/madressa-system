import Link from 'next/link';
import { ago } from '@/lib/owner-format';
import { getOwnerState } from '@/server/next/owner';
import { CheckNow } from './CheckNow';
import { Icon } from './icons';

export { Brand, Icon } from './icons';

// The owner dashboard's page frame, as drawn in design-reference/owner/owner-dashboard-design.html.
/** One page: the top bar with its title, when the madrasahs were last checked, then the page's own content. */
export async function Page({ title, crumb, className, children }: { title: string; crumb?: React.ReactNode; className?: string; children: React.ReactNode }) {
  const s = await getOwnerState();
  return (
    <>
      <header className="top">
        <h1>{crumb && <span className="crumb">{crumb}</span>}{title}</h1>
        {s.healthProblem ? <span className="checked status warn">{s.healthProblem}</span>
          : <span className="checked">{s.lastCheckAt ? `Checked ${ago(s.lastCheckAt, s.now).replace(/^Just now$/, 'just now')}` : 'Not checked yet'}</span>}
        <CheckNow />
        <Link className="btn icon-btn top-account" href="/owner/account" aria-label="Account and server"><Icon name="account" /></Link>
      </header>
      <main className={`view${className ? ` ${className}` : ''}`} id="view">{children}</main>
    </>
  );
}

/** A page whose features arrive in a later build step (OWNER-DASHBOARD.md, "Build order"). */
export const NotYet = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="card"><div className="empty"><b>{title}</b>{children}</div></div>
);
