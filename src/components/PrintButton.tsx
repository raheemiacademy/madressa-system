'use client';

/** Print, plus a real PDF of the same page rendered on the server (permissions still apply). */
export function PrintButton({ label = 'Print', pdfLabel = 'Download PDF' }: { label?: string; pdfLabel?: string }) {
  return (
    <>
      <button type="button" className="ra-btn" onClick={() => window.print()}>{label}</button>
      <button type="button" className="ra-btn" onClick={() => { window.location.href = `/admin/pdf?path=${encodeURIComponent(window.location.pathname + window.location.search)}`; }}>{pdfLabel}</button>
    </>
  );
}
