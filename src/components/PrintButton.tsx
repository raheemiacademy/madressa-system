'use client';

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return <button type="button" className="ra-btn" onClick={() => window.print()}>{label}</button>;
}
