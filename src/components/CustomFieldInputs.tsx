'use client';

import { useContext } from 'react';
import { FormErrors } from './Fields';

export type CF = { id: number; label: string; question: string | null; type: string; options: string[]; maxLength: number | null };

/** Renders §4 custom fields as `cf.<id>` (or `<prefix>cf.<id>`) inputs. */
export function CustomFieldInputs({ fields, values = {}, prefix = '' }: { fields: CF[]; values?: Record<number, unknown>; prefix?: string }) {
  const errors = useContext(FormErrors);
  if (!fields.length) return null;
  return (
    <div className="ra-fields">
      {fields.map((f) => {
        const name = `${prefix}cf.${f.id}`;
        const id = `f-${name}`;
        const err = errors?.[name];
        const v = values[f.id];
        const label = f.question || f.label;
        const aria = { 'aria-invalid': err ? true : undefined, 'aria-describedby': err ? `${id}-err` : undefined };
        if (f.type === 'radio' || f.type === 'checkboxes') return (
          <fieldset key={f.id} className="ra-fieldset ra-field full" {...aria}>
            <legend>{label}</legend>
            <div className="ra-checks">
              {f.options.map((o) => (
                <label key={o} className="ra-check">
                  <input type={f.type === 'radio' ? 'radio' : 'checkbox'} name={name} value={o} defaultChecked={Array.isArray(v) ? v.includes(o) : v === o} /><span>{o}</span>
                </label>
              ))}
            </div>
            {err && <span className="err" id={`${id}-err`}>{err}</span>}
          </fieldset>
        );
        const common = { id, name, defaultValue: v === null || v === undefined ? '' : String(v), ...aria };
        return (
          <div key={f.id} className={`ra-field${f.type === 'multiline' ? ' full' : ''}`}>
            <label htmlFor={id}>{label}</label>
            {f.type === 'multiline' ? <textarea className="ra-textarea" {...common} maxLength={f.maxLength ?? 5000} />
              : <input className="ra-input" {...common} maxLength={f.type === 'text' ? f.maxLength ?? 200 : undefined}
                type={f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'} inputMode={f.type === 'number' ? 'numeric' : f.type === 'decimal' ? 'decimal' : undefined} />}
            {err && <span className="err" id={`${id}-err`}>{err}</span>}
          </div>
        );
      })}
    </div>
  );
}
