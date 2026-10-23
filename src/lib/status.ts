// Chip colours from the dashboard design (STATUS_C). Unknown statuses fall back to lavender.
const C: Record<string, string> = {
  Cleared: 'var(--color-ok)', Current: 'var(--color-ok)', Complete: 'var(--color-ok)', Paid: 'var(--color-ok)', Employed: 'var(--color-ok)',
  Pending: 'var(--ra-blue)', Processing: 'var(--ra-blue)', 'Waiting List': 'var(--ra-blue)', Accepted: 'var(--ra-sky)', Volunteer: 'var(--ra-sky)',
  Bounced: 'var(--color-bad)', Failed: 'var(--color-bad)', Suspended: 'var(--color-bad)', Incomplete: 'var(--color-bad)', Expelled: 'var(--color-bad)', Dismissed: 'var(--color-bad)',
  'On Hold': 'var(--ra-violet)', 'Relocated/Left': 'var(--color-fg-muted)', Reversed: 'var(--ra-violet)', Rejected: 'var(--color-fg-muted)', Finished: 'var(--color-fg-muted)',
  Resigned: 'var(--color-fg-muted)', Retired: 'var(--color-fg-muted)', Inactive: 'var(--color-fg-muted)', Deceased: 'var(--color-fg-muted)'
};
export const statusColour = (s: string) => C[s] ?? 'var(--ra-lav)';
