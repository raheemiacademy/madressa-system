import Link from 'next/link';

export const metadata = { title: 'No access' };

export default function NoAccess() {
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>You don’t have access to that page</h1><p>Your account’s access level doesn’t include it. A super admin can change this under Settings → Admin staff.</p></div></div>
      <div><Link className="ra-btn" href="/admin">Back to the dashboard</Link></div>
    </div>
  );
}
