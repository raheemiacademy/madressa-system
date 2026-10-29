import Link from 'next/link';
import { Icon, type IconName } from './Icon';

/** An empty screen: an icon, one line in plain words, and one button to do the next thing. portal: the phone apps' dashed card. */
export function Empty({ icon, children, href, action, portal = false }: { icon: IconName; children: React.ReactNode; href?: string; action?: string; portal?: boolean }) {
  return (
    <div className={`${portal ? 'rp-empty ' : ''}ra-empty-x`}>
      <span className="ra-empty-ic"><Icon name={icon} /></span>
      <p>{children}</p>
      {href && action && <Link className={`ra-btn primary${portal ? ' tap' : ''}`} href={href}>{action}</Link>}
    </div>
  );
}
