'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { initials } from '@/lib/text';
import { logoutAction } from '@/app/_auth/actions';
import { crumbFor, isCurrent, NAV } from '../nav';
import { chooseYear } from './shell-actions';
import { NotesButton, NotesStrip } from './StickyNotes';
import { DrillStart } from './fire-drill/DrillStart';

type Props = {
  school: string; logoSrc: string | null; userName: string; userEmail: string;
  years: { id: number; title: string }[]; yearId: number | null; noteColours: string[];
  drillPlaces: string[]; drillRunning: boolean; notifications: number; unreadMessages: number; areas: ('fees' | 'comm')[];
  children: React.ReactNode;
};

export function Shell({ school, logoSrc, userName, userEmail, years, yearId, noteColours, drillPlaces, drillRunning, notifications, unreadMessages, areas, children }: Props) {
  const pathname = usePathname();
  const crumb = crumbFor(pathname);
  return (
    <div className="ra">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="ra-shell">
        <aside className="ra-side" aria-label="Main menu">
          <Link className="ra-brand" href="/admin">
            <span className="ra-brand-mark">
              {/* eslint-disable-next-line @next/next/no-img-element -- school-uploaded logo of unknown size */}
              {logoSrc ? <img src={logoSrc} alt="" /> : <Icon name="school" size={20} />}
            </span>
            <span className="ra-brand-text"><span className="ra-brand-name">{school}</span><span className="ra-brand-sub">School admin</span></span>
          </Link>
          <nav className="ra-nav" aria-label="Sections">
            {NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.need || areas.includes(i.need)) })).filter((g) => g.items.length).map((g) => (
              <div className="ra-nav-group" key={g.group}>
                <div className="ra-nav-label">{g.group}</div>
                {g.items.map((i) => (
                  <Link key={i.href} href={i.href} className="ra-nav-btn" aria-current={isCurrent(pathname, i.href) ? 'page' : undefined}>
                    <Icon name={i.icon} /><span>{i.label}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          {drillPlaces.includes('menu') && (
            <div className="ra-side-foot">
              <p><strong>Fire drill</strong>Get an instant list of who is on site, for every class.</p>
              {drillRunning ? <Link className="ra-drill" href="/admin/fire-drill">Drill running: open</Link> : <DrillStart big={false} describedBy="side-drill-hint" />}
              <p id="side-drill-hint">Press and hold for 2 seconds</p>
            </div>
          )}
        </aside>
        <div className="ra-main">
          <header className="ra-top">
            <div className="ra-crumb"><small>{crumb.group}</small><strong>{crumb.title}</strong></div>
            <SearchBox />
            <div className="ra-top-actions">
              <YearSwitcher years={years} yearId={yearId} />
              {drillPlaces.includes('header') && <Link className="ra-btn" href="/admin/fire-drill">Fire drill</Link>}
              <Link className="ra-icon-btn" href="/admin/register" aria-label={notifications ? `${notifications} ${notifications === 1 ? 'notification' : 'notifications'}: parent notices and holiday requests` : 'Notifications'}>
                <Icon name="bell" />{notifications > 0 && <span className="ra-badge" aria-hidden="true">{notifications}</span>}
              </Link>
              <Link className="ra-icon-btn" href="/admin/messages" aria-label={unreadMessages ? `${unreadMessages} unread ${unreadMessages === 1 ? 'message' : 'messages'}` : 'Messages'}>
                <Icon name="mail" />{unreadMessages > 0 && <span className="ra-badge" aria-hidden="true">{unreadMessages}</span>}
              </Link>
              <NotesButton colours={noteColours} />
              <AccountMenu name={userName} email={userEmail} />
            </div>
          </header>
          {drillRunning && !pathname.startsWith('/admin/fire-drill') && <div className="ra-banner ra-alert" role="alert" style={{ margin: '12px 28px 0' }}><div><b>A fire drill is running.</b></div><Link className="ra-link" href="/admin/fire-drill">Open roll call</Link></div>}
          <NotesStrip />
          <main id="main" tabIndex={-1} className="ra-content">{children}</main>
        </div>
      </div>
    </div>
  );
}

function SearchBox() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <form className="ra-search" role="search" action="/admin/search">
      <Icon name="search" />
      <input ref={ref} className="ra-input" name="q" type="search" autoComplete="off" spellCheck={false} enterKeyHint="search"
        placeholder="Search students, contacts, teachers…" aria-label="Search students, contacts and teachers" />
      <kbd aria-hidden="true">/</kbd>
    </form>
  );
}

function YearSwitcher({ years, yearId }: { years: Props['years']; yearId: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!years.length) return <select className="ra-select" aria-label="Academic year" disabled><option>No years yet</option></select>;
  return (
    <select className="ra-select" name="year" aria-label="Academic year" value={yearId ?? ''} disabled={pending}
      onChange={(e) => { const id = Number(e.target.value); start(async () => { await chooseYear(id); router.refresh(); }); }}>
      {years.map((y) => <option key={y.id} value={y.id}>{y.title}</option>)}
    </select>
  );
}

function AccountMenu({ name, email }: { name: string; email: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Native popover; place it under the avatar when it opens.
  const place = () => {
    const b = btn.current?.getBoundingClientRect(), m = menu.current;
    if (!b || !m) return;
    m.style.top = `${b.bottom + 6}px`;
    m.style.left = `${Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, b.right - m.offsetWidth))}px`;
  };
  return (
    <>
      <button ref={btn} type="button" className="ra-avatar" popoverTarget="account-menu" aria-label={`${initials(name)}, account menu for ${name}`}
        onClick={() => requestAnimationFrame(place)}>{initials(name)}</button>
      <div ref={menu} id="account-menu" popover="auto" className="ra-menu">
        <p><strong style={{ color: 'var(--color-fg)', display: 'block' }}>{name}</strong>{email}</p>
        <form action={logoutAction.bind(null, 'admin')}><button type="submit">Sign out</button></form>
      </div>
    </>
  );
}
