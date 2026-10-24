import Link from 'next/link';
import { notFound } from 'next/navigation';
import { initials } from '@/lib/text';
import type { ParentUser } from '@/server/next/portal';
import type { Kid } from '@/server/portal/access';

/** The child chosen with ?child=, else the first. A child who isn't this parent's is a 404, not a fallback. */
export function pickKid(p: ParentUser, raw?: string) {
  if (!p.ctx.kids.length) return null;
  if (!raw) return p.ctx.kids[0]!;
  const k = p.ctx.kids.find((x) => x.id === Number(raw));
  if (!k) notFound();
  return k;
}

/** Child switcher (design: ParentHome "Choose child"). Hidden with one child. */
export function KidSwitch({ kids, current, path }: { kids: Kid[]; current: Kid; path: string }) {
  if (kids.length < 2) return null;
  return (
    <nav className="rp-kids" aria-label="Choose child">
      {kids.map((k) => (
        <Link key={k.id} className="rp-kid tap" href={`${path}?child=${k.id}`} aria-current={k.id === current.id ? 'true' : undefined}>
          <span className="rp-av" aria-hidden="true">{initials(k.label)}</span>
          <span style={{ minWidth: 0 }}><b>{k.label}</b><small>{k.className ?? 'No class yet'}</small></span>
        </Link>
      ))}
    </nav>
  );
}

export function NoKids() {
  return <p className="rp-empty">No children are linked to your account yet. Please contact the school office.</p>;
}
