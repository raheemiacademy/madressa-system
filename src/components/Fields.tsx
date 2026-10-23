'use client';

import { createContext, useContext } from 'react';

// Labelled inputs with help and error text wired up for screen readers.
// Errors come from the `error` prop, or from the surrounding <Form>'s last result.
export const FormErrors = createContext<Record<string, string> | undefined>(undefined);

type Common = { name: string; label: string; error?: string; help?: string; full?: boolean; id?: string };

function useField(c: Common) {
  const ctx = useContext(FormErrors);
  const error = c.error ?? ctx?.[c.name];
  const id = c.id ?? `f-${c.name}`;
  const aria = {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': [c.help ? `${id}-help` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined
  };
  const wrap = (input: React.ReactNode) => (
    <div className={`ra-field${c.full ? ' full' : ''}`}>
      <label htmlFor={id}>{c.label}</label>
      {input}
      {c.help && <span className="help" id={`${id}-help`}>{c.help}</span>}
      {error && <span className="err" id={`${id}-err`}>{error}</span>}
    </div>
  );
  return { id, aria, wrap };
}

type InputProps = Common & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'id'>;
export function TextField({ name, label, error, help, full, id, ...rest }: InputProps) {
  const f = useField({ name, label, error, help, full, id });
  return f.wrap(<input className="ra-input" id={f.id} name={name} {...f.aria} {...rest} />);
}

export function TextArea({ name, label, error, help, full = true, id, ...rest }: Common & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'name' | 'id'>) {
  const f = useField({ name, label, error, help, full, id });
  return f.wrap(<textarea className="ra-textarea" id={f.id} name={name} {...f.aria} {...rest} />);
}

export function SelectField({ name, label, error, help, full, id, options, ...rest }: Common & { options: { value: string; label: string }[] } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'name' | 'id'>) {
  const f = useField({ name, label, error, help, full, id });
  return f.wrap(<select className="ra-select" id={f.id} name={name} {...f.aria} {...rest}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>);
}

export function Check({ name, label, defaultChecked, error, value }: { name: string; label: string; defaultChecked?: boolean; error?: string; value?: string }) {
  const ctx = useContext(FormErrors);
  const err = error ?? ctx?.[name];
  return (
    <div className="ra-field">
      <label className="ra-check"><input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} aria-invalid={err ? true : undefined} aria-describedby={err ? `f-${name}-err` : undefined} /><span>{label}</span></label>
      {err && <span className="err" id={`f-${name}-err`}>{err}</span>}
    </div>
  );
}

/** A group of checkboxes sharing one name (e.g. classes, groups). */
export function Checks({ name, legend, options, checked = [], help }: { name: string; legend: string; options: { value: string; label: string }[]; checked?: string[]; help?: string }) {
  const err = useContext(FormErrors)?.[name];
  return (
    <fieldset className="ra-fieldset ra-field full" aria-describedby={err ? `f-${name}-err` : undefined}>
      <legend>{legend}</legend>
      {options.length === 0 ? <p className="ra-note" style={{ margin: 0 }}>None to choose from yet.</p> : (
        <div className="ra-checks">
          {options.map((o) => <label key={o.value} className="ra-check"><input type="checkbox" name={name} value={o.value} defaultChecked={checked.includes(o.value)} /><span>{o.label}</span></label>)}
        </div>
      )}
      {help && <span className="help">{help}</span>}
      {err && <span className="err" id={`f-${name}-err`}>{err}</span>}
    </fieldset>
  );
}

export function FormMessage({ state }: { state?: { ok?: boolean; message?: string } }) {
  if (!state?.message || state.ok) return null;
  return <div className="ra-banner ra-alert" role="alert"><div>{state.message}</div></div>;
}
