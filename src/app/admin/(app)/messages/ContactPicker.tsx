'use client';

import { useEffect, useState, useTransition } from 'react';
import { findContactsAction } from './actions';

type C = { id: number; name: string; email: string | null };

/** Search contacts and collect them as hidden contactIds inputs. */
export function ContactPicker({ initial = [] }: { initial?: C[] }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<C[]>([]);
  const [chosen, setChosen] = useState<C[]>(initial);
  const [, start] = useTransition();
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => start(async () => setFound(await findContactsAction(q))), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <fieldset className="ra-fieldset ra-field full">
      <legend>Contacts</legend>
      {chosen.map((c) => <input key={c.id} type="hidden" name="contactIds" value={c.id} />)}
      {chosen.length > 0 && (
        <ul className="ra-chips" aria-label="Chosen contacts" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chosen.map((c) => <li key={c.id}><button type="button" className="ra-btn" aria-label={`Remove ${c.name}`} onClick={() => setChosen(chosen.filter((x) => x.id !== c.id))}>{c.name} ×</button></li>)}
        </ul>
      )}
      <label htmlFor="c-search" className="sr-only">Search contacts</label>
      <input id="c-search" className="ra-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts by name or email" autoComplete="off" />
      {q.trim().length >= 2 && (found.length === 0 ? <p className="ra-note" role="status">No contacts match.</p> : (
        <ul className="ra-picklist" aria-label="Matching contacts">
          {found.filter((c) => !chosen.some((x) => x.id === c.id)).map((c) => (
            <li key={c.id}><button type="button" className="ra-btn" onClick={() => { setChosen([...chosen, c]); setQ(''); }}>{c.name} <span className="ra-muted">{c.email ?? 'no email'}</span></button></li>
          ))}
        </ul>
      ))}
    </fieldset>
  );
}
