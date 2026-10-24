'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ActionButton } from '@/components/Form';
import { Icon } from '@/components/Icon';
import type { setupProgress } from '@/server/onboarding';
import { hideChecklistAction, skipStepAction } from './onboarding-actions';

type Progress = Awaited<ReturnType<typeof setupProgress>>;

/** "Set up your madrasah": the steps, ticked off from real data, with one clear next step. Optional steps can be skipped. */
export function SetupChecklist({ p }: { p: Progress }) {
  const pct = Math.round((p.finished / p.total) * 100);
  return (
    <section className="ra-card ra-setup" aria-labelledby="setup-h">
      <div className="ra-card-h">
        <div>
          <h2 id="setup-h">{p.complete ? 'Your madrasah is set up' : 'Set up your madrasah'}</h2>
          <div className="ra-note">{p.complete ? 'Everything’s in place. You can come back to any step from Settings.' : `${p.finished} of ${p.total} done. Your progress is saved, so you can stop at any time.`}</div>
        </div>
        <ActionButton action={hideChecklistAction.bind(null, true)} label={p.complete ? 'Close' : 'Hide for now'} className="ra-link" />
      </div>
      <div className="ra-setup-bar" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.finished} aria-valuetext={`${p.finished} of ${p.total} steps done`}><span style={{ width: `${pct}%` }} /></div>
      <ol className="ra-setup-steps">
        {p.steps.map((s) => {
          const isNext = p.next?.key === s.key;
          const state = s.done ? 'done' : s.skipped ? 'skipped' : isNext ? 'next' : 'todo';
          return (
            <li key={s.key} data-state={state} aria-current={isNext ? 'step' : undefined}>
              <span className="ra-setup-num" aria-hidden="true">{s.done ? <Icon name="check" /> : s.n}</span>
              <div className="ra-setup-body">
                <div className="ra-setup-title">{s.title}{'optional' in s && <span className="ra-muted"> · optional</span>}
                  <span className="sr-only">{s.done ? ' (done)' : s.skipped ? ' (skipped)' : ''}</span></div>
                {(isNext || state === 'todo') && <p className="ra-setup-why">{s.why}</p>}
                {isNext && (
                  <div className="ra-toolbar">
                    <Link className="ra-btn primary" href={s.href}>{p.finished ? 'Continue' : 'Start'} with step {s.n}</Link>
                    {s.more && <Link className="ra-btn" href={s.more[0]}>{s.more[1]}</Link>}
                    {'optional' in s && <ActionButton action={skipStepAction.bind(null, s.key, true)} label="Skip this step" />}
                  </div>
                )}
              </div>
              <div className="ra-setup-side">
                {s.done ? <Link className="ra-link" href={s.href}>Review</Link>
                  : s.skipped ? <ActionButton action={skipStepAction.bind(null, s.key, false)} label="Undo skip" className="ra-link" />
                    : !isNext && <Link className="ra-link" href={s.href}>Open</Link>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The first thing a new madrasah sees after setup: a short welcome that leads into step 1. */
export function Welcome({ school, name, firstHref }: { school: string; name: string; firstHref: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => { dlg.current?.showModal(); }, []);
  const close = () => { dlg.current?.close(); router.replace('/admin'); };
  return (
    <dialog ref={dlg} className="ra-dialog ra-welcome" aria-labelledby="welcome-h" onCancel={close}>
      <div className="ra-welcome-mark" aria-hidden="true"><Icon name="school" /></div>
      <h2 id="welcome-h">Assalamu alaikum, {name}</h2>
      <p>{school} is ready to set up. Six short steps get you from an empty system to registers, fees and the parent app:</p>
      <ol>
        <li>Madrasah details</li><li>School year and holidays</li><li>Classes and teachers</li><li>Students and parents (import a spreadsheet)</li><li>Fees (optional)</li><li>Invite parents and teachers (optional)</li>
      </ol>
      <p className="ra-muted">Most madrasahs finish in an afternoon. The checklist stays on your dashboard, ticks itself off as you go, and saves your progress.</p>
      <div className="ra-toolbar">
        <Link className="ra-btn primary" href={firstHref}>Start with step 1</Link>
        <button type="button" className="ra-btn" onClick={close}>Look around first</button>
      </div>
    </dialog>
  );
}
