'use client';

import { useState } from 'react';
import { Icon } from './Icon';

/** A password field with an eye button that shows what was typed (instead of asking for it twice). */
export function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> & { id: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="ra-pw">
      <input {...props} className="ra-input" type={show ? 'text' : 'password'} />
      <button type="button" className="ra-pw-eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} aria-controls={props.id} onClick={() => setShow(!show)}>
        <Icon name={show ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  );
}
