'use client';

import { useState } from 'react';
import { Checks, Check, TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { saveEventAction } from './actions';

type Consent = { text: string; required: boolean };
type Price = { description: string; price: string; required: boolean };
type Slot = { date: string; from: string; to: string };
export type EventValues = {
  name: string; date: string; time: string; days: number; hours: number; minutes: number; optInDeadline: string; paymentDeadline: string;
  description: string; terms: string; classIds: string[]; autoInvoice: boolean; active: boolean; consents: Consent[]; prices: Price[]; slots: Slot[];
};

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** §8 Add event: details, consent items, itemised prices and timeslots (generated from dates, times and an interval). */
export function EventEditor({ id, v, classes, locked }: { id: number | null; v: EventValues; classes: { value: string; label: string }[]; locked: boolean }) {
  const [consents, setConsents] = useState<Consent[]>(v.consents);
  const [prices, setPrices] = useState<Price[]>(v.prices);
  const [slots, setSlots] = useState<Slot[]>(v.slots);
  const [gen, setGen] = useState({ dates: v.date, from: '10:00', to: '12:00', interval: '30' });
  const make = () => {
    const out: Slot[] = [];
    const iv = Number(gen.interval);
    if (!(iv >= 5)) return;
    for (const d of gen.dates.split(/[\s,]+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) for (let m = toMin(gen.from); m + iv <= toMin(gen.to) && out.length < 500; m += iv) out.push({ date: d, from: fmt(m), to: fmt(m + iv) });
    setSlots(out);
  };
  return (
    <Form action={saveEventAction.bind(null, id)} submit={id ? 'Save event' : 'Add event'}>
      <input type="hidden" name="consents" value={JSON.stringify(consents)} /><input type="hidden" name="prices" value={JSON.stringify(prices)} /><input type="hidden" name="slots" value={JSON.stringify(slots)} />
      <div className="ra-fields">
        <TextField name="name" label="Event name" full defaultValue={v.name} />
        <TextField name="date" label="Date" type="date" defaultValue={v.date} />
        <TextField name="time" label="Time" type="time" defaultValue={v.time} />
        <TextField name="days" label="Lasts (days)" inputMode="numeric" defaultValue={String(v.days)} />
        <TextField name="hours" label="Hours" inputMode="numeric" defaultValue={String(v.hours)} />
        <TextField name="minutes" label="Minutes" inputMode="numeric" defaultValue={String(v.minutes)} />
        <TextField name="optInDeadline" label="Opt-in deadline" type="date" defaultValue={v.optInDeadline} />
        <TextField name="paymentDeadline" label="Payment deadline" type="date" defaultValue={v.paymentDeadline} />
      </div>
      <TextArea name="description" label="Description" rows={4} defaultValue={v.description} />
      <TextArea name="terms" label="Terms" rows={3} defaultValue={v.terms} />
      <Checks name="classIds" legend="For these classes (none = everyone)" options={classes} checked={v.classIds} />
      <div className="ra-checks"><Check name="autoInvoice" label="Invoice families when they opt in" defaultChecked={v.autoInvoice} /><Check name="active" label="Active (open for opt-in)" defaultChecked={v.active} /></div>

      {locked ? <p className="ra-note">Families have already opted in, so consents, prices and timeslots are fixed.</p> : (
        <>
          <fieldset className="ra-fieldset"><legend>Consent items</legend>
            {consents.length === 0 && <p className="ra-note" style={{ margin: 0 }}>None yet.</p>}
            {consents.map((c, i) => (
              <div key={i} className="ra-toolbar">
                <div className="ra-field grow"><label htmlFor={`c-${i}`}>Consent {i + 1}</label><input className="ra-input" id={`c-${i}`} value={c.text} onChange={(e) => setConsents(consents.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} /></div>
                <label className="ra-check"><input type="checkbox" checked={c.required} onChange={(e) => setConsents(consents.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /><span>Required</span></label>
                <button type="button" className="ra-btn danger" onClick={() => setConsents(consents.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <button type="button" className="ra-btn" onClick={() => setConsents([...consents, { text: '', required: true }])}>+ Add consent item</button>
          </fieldset>
          <fieldset className="ra-fieldset"><legend>Prices</legend>
            {prices.length === 0 && <p className="ra-note" style={{ margin: 0 }}>Free event.</p>}
            {prices.map((p, i) => (
              <div key={i} className="ra-toolbar">
                <div className="ra-field grow"><label htmlFor={`pd-${i}`}>Item {i + 1}</label><input className="ra-input" id={`pd-${i}`} value={p.description} onChange={(e) => setPrices(prices.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /></div>
                <div className="ra-field"><label htmlFor={`pp-${i}`}>Price (£)</label><input className="ra-input" id={`pp-${i}`} inputMode="decimal" value={p.price} onChange={(e) => setPrices(prices.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} style={{ width: 110 }} /></div>
                <label className="ra-check"><input type="checkbox" checked={p.required} onChange={(e) => setPrices(prices.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /><span>Always charged</span></label>
                <button type="button" className="ra-btn danger" onClick={() => setPrices(prices.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <button type="button" className="ra-btn" onClick={() => setPrices([...prices, { description: '', price: '', required: true }])}>+ Add price</button>
          </fieldset>
          <fieldset className="ra-fieldset"><legend>Timeslots (optional)</legend>
            <div className="ra-toolbar">
              <div className="ra-field grow"><label htmlFor="g-dates">Dates (YYYY-MM-DD, comma-separated)</label><input className="ra-input" id="g-dates" value={gen.dates} onChange={(e) => setGen({ ...gen, dates: e.target.value })} /></div>
              <div className="ra-field"><label htmlFor="g-from">From</label><input className="ra-input" id="g-from" type="time" value={gen.from} onChange={(e) => setGen({ ...gen, from: e.target.value })} /></div>
              <div className="ra-field"><label htmlFor="g-to">To</label><input className="ra-input" id="g-to" type="time" value={gen.to} onChange={(e) => setGen({ ...gen, to: e.target.value })} /></div>
              <div className="ra-field"><label htmlFor="g-int">Every (minutes)</label><input className="ra-input" id="g-int" inputMode="numeric" value={gen.interval} onChange={(e) => setGen({ ...gen, interval: e.target.value })} style={{ width: 90 }} /></div>
              <button type="button" className="ra-btn" onClick={make}>Make timeslots</button>
              {slots.length > 0 && <button type="button" className="ra-btn danger" onClick={() => setSlots([])}>Clear</button>}
            </div>
            <p className="ra-note" style={{ margin: 0 }} aria-live="polite">{slots.length ? `${slots.length === 1 ? '1 timeslot' : `${slots.length} timeslots`}: ${slots.slice(0, 6).map((s) => `${s.date} ${s.from}–${s.to}`).join(', ')}${slots.length > 6 ? '…' : ''}` : 'No timeslots: families just opt in.'}</p>
          </fieldset>
        </>
      )}
    </Form>
  );
}
