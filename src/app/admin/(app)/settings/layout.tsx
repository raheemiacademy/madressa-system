import { requireAdmin } from '@/server/next/actor';
import { SettingsNav } from './SettingsNav';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin('super');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Settings</h1><p>School profile, portals, fees, registers and messaging</p></div></div>
      <div className="ra-grid ra-settings">
        <div className="ra-c4 ra-settings-side"><SettingsNav /></div>
        <div className="ra-c8" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}
