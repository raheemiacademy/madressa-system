'use client';

export function SaveBar({ pending, state, label = 'Save changes' }: { pending: boolean; state?: { ok?: boolean; message?: string }; label?: string }) {
  return (
    <div className="ra-savebar">
      <button className="ra-btn primary" type="submit" disabled={pending}>{pending ? 'Saving…' : label}</button>
      <span role="status" aria-live="polite" style={state?.ok ? undefined : { color: 'var(--color-bad)' }}>{pending ? '' : state?.message}</span>
    </div>
  );
}
