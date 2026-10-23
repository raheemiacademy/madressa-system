// Labelled inputs with help and error text wired up for screen readers.
type Common = { name: string; label: string; error?: string; help?: string; full?: boolean };

function wrap(id: string, c: Common, input: React.ReactNode) {
  return (
    <div className={`ra-field${c.full ? ' full' : ''}`}>
      <label htmlFor={id}>{c.label}</label>
      {input}
      {c.help && <span className="help" id={`${id}-help`}>{c.help}</span>}
      {c.error && <span className="err" id={`${id}-err`}>{c.error}</span>}
    </div>
  );
}

const aria = (id: string, c: Common) => ({
  'aria-invalid': c.error ? true : undefined,
  'aria-describedby': [c.help ? `${id}-help` : '', c.error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined
});

type InputProps = Common & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name'>;
export function TextField({ name, label, error, help, full, ...rest }: InputProps) {
  const c = { name, label, error, help, full };
  const id = `f-${name}`;
  return wrap(id, c, <input className="ra-input" id={id} name={name} {...aria(id, c)} {...rest} />);
}

export function TextArea({ name, label, error, help, full = true, ...rest }: Common & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'name'>) {
  const c = { name, label, error, help, full };
  const id = `f-${name}`;
  return wrap(id, c, <textarea className="ra-textarea" id={id} name={name} {...aria(id, c)} {...rest} />);
}

export function SelectField({ name, label, error, help, full, options, ...rest }: Common & { options: { value: string; label: string }[] } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'name'>) {
  const c = { name, label, error, help, full };
  const id = `f-${name}`;
  return wrap(id, c, <select className="ra-select" id={id} name={name} {...aria(id, c)} {...rest}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>);
}

export function Check({ name, label, defaultChecked, error }: { name: string; label: string; defaultChecked?: boolean; error?: string }) {
  return (
    <div className="ra-field">
      <label className="ra-check"><input type="checkbox" name={name} defaultChecked={defaultChecked} aria-invalid={error ? true : undefined} aria-describedby={error ? `f-${name}-err` : undefined} /><span>{label}</span></label>
      {error && <span className="err" id={`f-${name}-err`}>{error}</span>}
    </div>
  );
}

export function FormMessage({ state }: { state?: { ok?: boolean; message?: string } }) {
  if (!state?.message || state.ok) return null;
  return <div className="ra-banner ra-alert" role="alert"><div>{state.message}</div></div>;
}
