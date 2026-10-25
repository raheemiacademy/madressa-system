'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { chime, setSound, soundOn } from '@/lib/chime';

/** Sounds on/off for new messages and requests, on this device. Turning it on plays the sound so you know what it's like. */
export function SoundToggle({ className }: { className: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => setOn(soundOn()), []);
  return (
    <button type="button" className={className} aria-pressed={on ?? true} onClick={() => { const next = !(on ?? true); setSound(next); setOn(next); if (next) chime(); }}>
      <Icon name="bell" /><span>Sounds</span><small className="ra-toggle-state" aria-hidden="true">{on === false ? 'Off' : 'On'}</small>
    </button>
  );
}
