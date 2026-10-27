'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { THEME_COOKIE } from '@/lib/theme';

const isDark = () => document.documentElement.dataset.theme
  ? document.documentElement.dataset.theme === 'dark'
  : matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * Switches between light and dark on this device. Until someone uses it, the school's theme setting (admin) or the
 * device's own setting decides. The choice is kept in a cookie for a year.
 */
export function ThemeToggle({ className, label = false }: { className: string; label?: boolean }) {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => setDark(isDark()), []);
  const flip = () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setDark(next === 'dark');
  };
  return (
    <button type="button" className={className} onClick={flip} aria-pressed={dark ?? false}>
      <Icon name={dark ? 'sun' : 'moon'} />
      <span className={label ? undefined : 'sr-only'}>Dark mode</span>
      {label && <small className="ra-toggle-state" aria-hidden="true">{dark ? 'On' : 'Off'}</small>}
    </button>
  );
}
