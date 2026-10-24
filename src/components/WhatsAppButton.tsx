'use client';

import { useState } from 'react';

/**
 * Question 8: a WhatsApp button instead of the SMS "one-click" option. It opens WhatsApp (the app, or WhatsApp Web on a
 * computer) to this number with a ready-written message the user can change before sending. Nothing is sent by the system.
 */
export function WhatsAppButton({ number, name, messages }: { number: string; name: string; messages: { label: string; text: string }[] }) {
  const [text, setText] = useState(messages[0]?.text ?? '');
  const href = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  const id = `wa-${number}`;
  return (
    <div className="ra-toolbar" style={{ alignItems: 'flex-end' }}>
      {messages.length > 0 && (
        <div className="ra-field"><label htmlFor={id}>WhatsApp message to {name}</label>
          <select className="ra-select" id={id} onChange={(e) => setText(messages[Number(e.target.value)]?.text ?? '')}>{messages.map((m, i) => <option key={m.label} value={i}>{m.label}</option>)}</select></div>
      )}
      <a className="ra-btn" href={href} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>
    </div>
  );
}
