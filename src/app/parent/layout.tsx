import type { Metadata } from 'next';
import { PwaRegister } from '@/app/_portal/TabBar';

export const metadata: Metadata = {
  title: { default: 'Parent portal', template: '%s · Parent portal' },
  manifest: '/pwa/parent',
  appleWebApp: { capable: true, title: 'Parents', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' }
};

/** Every parent page, signed in or not, is part of the installable Parents app. */
export default function ParentRoot({ children }: { children: React.ReactNode }) {
  return <>{children}<PwaRegister scope="/parent" /></>;
}
