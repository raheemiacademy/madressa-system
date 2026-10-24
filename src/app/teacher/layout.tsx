import type { Metadata } from 'next';
import { PwaRegister } from '@/app/_portal/TabBar';

export const metadata: Metadata = {
  title: { default: 'Teacher portal', template: '%s · Teacher portal' },
  manifest: '/pwa/teacher',
  appleWebApp: { capable: true, title: 'Teachers', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' }
};

/** Every teacher page, signed in or not, is part of the installable Teachers app. */
export default function TeacherRoot({ children }: { children: React.ReactNode }) {
  return <>{children}<PwaRegister scope="/teacher" /></>;
}
