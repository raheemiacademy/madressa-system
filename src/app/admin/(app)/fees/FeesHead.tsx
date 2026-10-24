import Link from 'next/link';
import { AddFeesButton } from './AddFees';

/** Page heading for fees pages: title, description, Add Fees, and any page buttons. */
export function FeesHead({ title, desc, back = true, children }: { title: string; desc: string; back?: boolean; children?: React.ReactNode }) {
  return (
    <div className="ra-page-h"><div><h1>{title}</h1><p>{desc}</p></div>
      <div className="ra-toolbar"><AddFeesButton />{children}{back && <Link className="ra-btn" href="/admin/fees">Fees</Link>}</div></div>
  );
}
