'use client';

import { useEffect, useState } from 'react';

/**
 * Today in the visitor's own calendar: "Monday 26 October · 5 Jumada al-Awwal 1448 AH". Shows "Today" until the browser fills it in.
 * `stacked` puts the Islamic date on its own, smaller line under the usual one (the contact page).
 */
export function Today({ className, stacked }: { className?: string; stacked?: boolean }) {
  const [parts, setParts] = useState<{ greg: string; hijri: string } | null>(null);
  useEffect(() => {
    const now = new Date();
    const greg = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
    let hijri = '';
    try { hijri = new Intl.DateTimeFormat('en-GB-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(now); } catch { hijri = ''; }
    setParts({ greg, hijri });
  }, []);
  return <p className={className}>{parts ? <><b>{parts.greg}</b>{parts.hijri && (stacked ? <span>{parts.hijri}</span> : ` · ${parts.hijri}`)}</> : 'Today'}</p>;
}

/** This year, from the visitor's clock. */
export function Year() {
  const [year, setYear] = useState('2026');
  useEffect(() => setYear(String(new Date().getFullYear())), []);
  return <span>{year}</span>;
}
