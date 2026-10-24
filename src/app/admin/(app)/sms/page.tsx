import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { GROUPS, listSmsTemplates, smsBalance } from '@/server/comm/sms';
import { yearAndClasses } from '../students/year-classes';
import { CommTabs } from '../newsletters/CommTabs';
import { SmsForm } from './SmsForm';

export const metadata = { title: 'Send SMS' };

export default async function SendSms() {
  const admin = await requireAdmin('sms');
  const [{ options }, templates, bal] = await Promise.all([yearAndClasses(), listSmsTemplates(db), smsBalance(db)]);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Send SMS</h1><p>Text a group, chosen classes or contacts, or numbers from a CSV. Texts are queued and sent in the background.</p></div></div>
      <CommTabs admin={admin} current="/admin/sms" />
      <div className="ra-banners"><div className="ra-banner"><div>{bal.provider === 'log'
        ? <>Test mode: texts are logged but not really sent. Real sending is switched on by the server’s SMS setting once you approve a provider.</>
        : <>Provider: <b>{bal.provider === 'clicksend' ? 'ClickSend' : 'VoodooSMS'}</b> · credit: <b>{bal.balance ?? 'unknown'}</b></>}</div></div></div>
      <SmsForm groups={Object.entries(GROUPS)} classes={options} templates={templates.map((t) => ({ id: t.id, label: `${t.category}: ${t.name}`, body: t.body }))} />
    </div>
  );
}
