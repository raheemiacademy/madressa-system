'use client';

import { useActionState, useState } from 'react';
import { Icon } from '@/components/Icon';
import { SaveBar } from '@/components/SaveBar';
import { penceToInput } from '@/lib/money';
import { LINK_ICONS, tabByKey, type Field } from '@/settings/tabs';
import { saveTabAction, type TabFormState } from './actions';

type Link = { label: string; url: string; icon: string };

export function TabForm({ tabKey, values }: { tabKey: string; values: Record<string, unknown> }) {
  const tab = tabByKey(tabKey)!;
  const [state, action, pending] = useActionState<TabFormState, FormData>(saveTabAction.bind(null, tabKey), undefined);
  const err = (n: string) => state?.errors?.[n];
  return (
    <form className="ra-card ra-form" action={action} noValidate>
      <div className="ra-card-h"><div><h2>{tab.title}</h2><div className="ra-note">{tab.description}</div></div></div>
      <div className="ra-fields">
        {tab.fields.map((f) => <FieldInput key={f.name} f={f} value={values[f.name]} error={err(f.name)} />)}
      </div>
      <SaveBar pending={pending} state={state} />
    </form>
  );
}

function FieldInput({ f, value, error }: { f: Field; value: unknown; error?: string }) {
  const id = `f-${f.name}`;
  const described = [f.help ? `${id}-help` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  const common = { id, name: f.name, 'aria-invalid': error ? true : undefined, 'aria-describedby': described };
  const help = f.help && <span className="help" id={`${id}-help`}>{f.help}</span>;
  const errEl = error && <span className="err" id={`${id}-err`}>{error}</span>;
  const cls = `ra-field${f.full || f.type === 'checks' || f.type === 'links' || f.type === 'textarea' ? ' full' : ''}`;

  if (f.type === 'toggle') return (
    <div className={cls}>
      <label className="ra-check"><input type="checkbox" {...common} defaultChecked={!!value} /><span>{f.label}</span></label>
      {help}{errEl}
    </div>
  );
  if (f.type === 'checks') return (
    <fieldset className={`ra-fieldset ${cls}`} aria-describedby={described}>
      <legend>{f.label}</legend>
      <div className="ra-checks">
        {f.options.map((o) => (
          <label key={o.value} className="ra-check"><input type="checkbox" name={f.name} value={o.value} defaultChecked={(value as string[]).includes(o.value)} /><span>{o.label}</span></label>
        ))}
      </div>
      {help}{errEl}
    </fieldset>
  );
  if (f.type === 'links') return <LinksInput f={f} initial={(value as Link[]) ?? []} error={error} />;

  let input: React.ReactNode;
  switch (f.type) {
    case 'select': input = <select className="ra-select" {...common} defaultValue={String(value)}>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>; break;
    case 'textarea': input = <textarea className="ra-textarea" {...common} defaultValue={String(value ?? '')} maxLength={f.max} />; break;
    case 'int': input = <input className="ra-input" {...common} type="number" inputMode="numeric" min={f.min} max={f.max} step={1} defaultValue={String(value)} />; break;
    case 'money': input = <input className="ra-input" {...common} inputMode="decimal" defaultValue={penceToInput(Number(value))} placeholder="0.00" />; break;
    case 'email': input = <input className="ra-input" {...common} type="email" inputMode="email" autoComplete="off" defaultValue={String(value ?? '')} />; break;
    case 'url': input = <input className="ra-input" {...common} type="url" inputMode="url" placeholder="https://" defaultValue={String(value ?? '')} />; break;
    case 'extensions': input = <input className="ra-input" {...common} defaultValue={(value as string[]).join(', ')} autoCapitalize="none" spellCheck={false} />; break;
    case 'secret': input = <input className="ra-input" {...common} type="password" autoComplete="new-password" placeholder={value ? 'Saved. Leave blank to keep it' : ''} />; break;
    case 'file': input = (
      <>
        <input className="ra-input" {...common} type="file" accept={f.accept} style={{ paddingTop: 8 }} />
        {typeof value === 'string' && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded branding file */}
            {f.kind === 'image' && <img src={`/files/${value}`} alt="Current image" style={{ maxWidth: 200, borderRadius: 8 }} />}
            <label className="ra-check"><input type="checkbox" name={`${f.name}.remove`} /><span>Remove the current {f.kind}</span></label>
          </>
        )}
      </>
    ); break;
    default: input = <input className="ra-input" {...common} defaultValue={String(value ?? '')} maxLength={'max' in f ? f.max : undefined} />;
  }
  return <div className={cls}><label htmlFor={id}>{f.label}</label>{input}{help}{errEl}</div>;
}

function LinksInput({ f, initial, error }: { f: Field; initial: Link[]; error?: string }) {
  const [rows, setRows] = useState<(Link & { key: number })[]>(() => initial.map((l, i) => ({ ...l, key: i })));
  const [next, setNext] = useState(initial.length);
  return (
    <fieldset className="ra-fieldset ra-field full">
      <legend>{f.label}</legend>
      {rows.length === 0 && <p className="ra-note" style={{ margin: 0 }}>No links yet.</p>}
      {rows.map((r, i) => (
        <div key={r.key} className="ra-fields ra-link-row">
          <div className="ra-field"><label htmlFor={`${f.name}-l-${r.key}`}>Label</label><input className="ra-input" id={`${f.name}-l-${r.key}`} name={`${f.name}.label`} defaultValue={r.label} maxLength={60} /></div>
          <div className="ra-field"><label htmlFor={`${f.name}-u-${r.key}`}>Web address</label><input className="ra-input" id={`${f.name}-u-${r.key}`} name={`${f.name}.url`} type="url" inputMode="url" placeholder="https://" defaultValue={r.url} /></div>
          <div className="ra-field"><label htmlFor={`${f.name}-i-${r.key}`}>Icon</label>
            <select className="ra-select" id={`${f.name}-i-${r.key}`} name={`${f.name}.icon`} defaultValue={r.icon}>{LINK_ICONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <div><button type="button" className="ra-btn danger" aria-label={`Remove link ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button></div>
        </div>
      ))}
      <div style={{ marginTop: 10 }}>
        <button type="button" className="ra-btn" onClick={() => { setRows([...rows, { label: '', url: '', icon: 'link', key: next }]); setNext(next + 1); }}><Icon name="plus" />Add link</button>
      </div>
      {error && <span className="err">{error}</span>}
    </fieldset>
  );
}
