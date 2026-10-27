/** WhatsApp-style ticks on a message you sent: grey when delivered, blue once the other side has read it. */
export function Ticks({ read }: { read: boolean }) {
  return (
    <span className={`ra-ticks${read ? ' read' : ''}`}>
      <svg viewBox="0 0 18 12" width="18" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m1 6.5 3.2 3.2L11 2.8" /><path d="m7.5 9.7 6.9-6.9" /></svg>
      <span className="sr-only">{read ? 'Read' : 'Delivered'}</span>
    </span>
  );
}
