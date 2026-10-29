'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { PasswordInput } from '@/components/PasswordInput';
import type { Portal } from '@/server/auth';
import { loginAction, type LoginState } from './actions';
import { RequestLinkPanel } from './PasswordForms';

type Panel = 'signin' | 'link';

/**
 * Sign in, with "email me a link" beside it in the same card (admin, teacher, parent). The link slides the card across and
 * changes the address to /set-password without loading a page, carrying the email over; the browser's Back slides it back.
 * Only the panel on show (and, while it slides away, the one before) is rendered, so the page never has two Email boxes.
 */
export function LoginForm({ portal, title, school, next }: { portal: Portal; title: string; school: string; next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction.bind(null, portal), undefined);
  const card = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    // A wrong password shakes the card once; a right one shows "✓ Signed in" for a moment before the page moves on.
    if (state?.error && card.current) { card.current.classList.remove('shake'); void card.current.offsetWidth; card.current.classList.add('shake'); }
    if (state?.next) { const t = setTimeout(() => router.replace(state.next!), 400); return () => clearTimeout(t); }
  }, [state, router]);
  const done = !!state?.next;

  const panel: Panel = usePathname().endsWith('/set-password') ? 'link' : 'signin';
  const [shown, setShown] = useState(panel);
  const [leaving, setLeaving] = useState<Panel | null>(null);
  const [email, setEmail] = useState<string>();
  if (shown !== panel) { setLeaving(shown); setShown(panel); }
  useEffect(() => {
    if (!leaving) return;
    card.current?.querySelector<HTMLInputElement>(`[data-p="${shown}"] input[name="email"]`)?.focus({ preventScroll: true });
    const t = setTimeout(() => setLeaving(null), 350);
    return () => clearTimeout(t);
  }, [leaving, shown]);
  const on = (p: Panel) => shown === p || leaving === p;
  const go = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setEmail(e.currentTarget.closest('[data-p]')?.querySelector<HTMLInputElement>('input[name="email"]')?.value);
    history.pushState(null, '', e.currentTarget.href);
  };
  const loginHref = `/${portal}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <main className="ra-auth">
      <div ref={card} className="ra-auth-card ra-slide" data-panel={shown}>
        <div className="ra-slide-track">
          <form data-p="signin" action={action} noValidate inert={shown !== 'signin'}>
            {on('signin') && <>
              <div>
                <div className="ra-muted" style={{ fontSize: 13 }}>{school}</div>
                <h1>{title}</h1>
              </div>
              {state?.error && <div className="ra-banner ra-alert" role="alert"><div>{state.error}</div></div>}
              {state?.notice && <div className="ra-banner ra-success" role="status"><div>{state.notice}</div></div>}
              <input type="hidden" name="next" value={next ?? ''} />
              <div className="ra-field">
                <label htmlFor="email">Email</label>
                <input className="ra-input" id="email" name="email" type="email" inputMode="email" autoComplete="username" enterKeyHint="next" required defaultValue={state?.email ?? email} />
              </div>
              <div className="ra-field">
                <label htmlFor="password">Password</label>
                <PasswordInput id="password" name="password" autoComplete="current-password" enterKeyHint="go" required />
              </div>
              <button className={`ra-btn primary${done ? ' is-done' : ''}`} type="submit" disabled={pending || done} aria-busy={pending || undefined}>{done ? '✓ Signed in' : 'Sign in'}</button>
              {(portal === 'admin' || portal === 'teacher' || portal === 'parent') && <Link className="ra-link" href={`/${portal}/set-password`} onClick={go}>{portal === 'admin' ? 'Forgotten your password?' : 'First time here, or forgotten your password?'}</Link>}
            </>}
          </form>
          <div data-p="link" inert={shown !== 'link'}>
            {on('link') && <RequestLinkPanel portal={portal} school={school} email={email} back={loginHref} onBack={go} />}
          </div>
        </div>
      </div>
    </main>
  );
}
