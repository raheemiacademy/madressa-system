import Link from 'next/link';
import { db } from '@/db';
import { WhatsAppList } from '@/components/WhatsAppList';
import { requireAdmin } from '@/server/next/actor';
import { GROUPS, type Group } from '@/server/comm/sms';
import { messageTemplates, WA_GROUPS, whatsappList } from '@/server/comm/whatsapp';
import { yearAndClasses } from '../students/year-classes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'WhatsApp' };
const GREETING = 'Salaam {NAME}, ';

/**
 * §11 Messages to parents and teachers by WhatsApp, in place of texts for now. Choose who and the message, then work down the list:
 * each button opens WhatsApp with the message written. Nothing is sent by the system.
 */
export default async function WhatsApp({ searchParams }: { searchParams: Promise<{ group?: string; class?: string | string[]; template?: string; body?: string }> }) {
  await requireAdmin('sms');
  const sp = await searchParams;
  const group = (WA_GROUPS as string[]).includes(sp.group ?? '') ? sp.group as Group : null;
  const classIds = [sp.class ?? []].flat().map(Number).filter(Boolean);
  const [templates, { options }] = await Promise.all([messageTemplates(db), yearAndClasses()]);
  const chosen = templates.find((t) => String(t.id) === sp.template);
  // A template fills the message unless something else has been typed over the starting greeting.
  const typed = !!sp.body?.trim() && sp.body.trim() !== GREETING.trim();
  const body = (typed ? sp.body! : chosen?.body ?? (group ? GREETING : '')).slice(0, 2000);
  const list = group && (group !== 'classes' || classIds.length) ? await whatsappList(db, group, body, { classIds }) : null;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>WhatsApp</h1><p>Message parents and teachers on WhatsApp. Each button opens WhatsApp with the message written; you press send.</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href="/admin/sms/templates">Message templates</Link></div></div>
      <form className="ra-card ra-form">
        <div className="ra-fields">
          <div className="ra-field"><label htmlFor="wa-group">Who</label>
            <select className="ra-select" id="wa-group" name="group" defaultValue={group ?? ''}>
              <option value="">Choose…</option>{WA_GROUPS.map((g) => <option key={g} value={g}>{GROUPS[g]}</option>)}
            </select></div>
          <div className="ra-field"><label htmlFor="wa-tpl">Start from a template</label>
            <select className="ra-select" id="wa-tpl" name="template" defaultValue={chosen ? String(chosen.id) : ''}>
              <option value="">A blank message</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.category}: {t.name}</option>)}
            </select></div>
        </div>
        {options.length > 0 && (
          <fieldset className="ra-fieldset"><legend>Classes (for “Primary contacts in chosen classes”)</legend><div className="ra-checks">
            {options.map((o) => <label key={o.value} className="ra-check"><input type="checkbox" name="class" value={o.value} defaultChecked={classIds.includes(Number(o.value))} /> {o.label}</label>)}
          </div></fieldset>
        )}
        <div className="ra-field full"><label htmlFor="wa-body">Message</label>
          <textarea className="ra-textarea" id="wa-body" name="body" rows={4} defaultValue={body} maxLength={2000} placeholder="Salaam {NAME}, …" />
          <span className="help">{'{NAME}'} becomes each person’s first name. A template replaces the starting greeting, but not a message you’ve typed.</span></div>
        <div className="ra-toolbar"><button className="ra-btn primary">Show the list</button></div>
      </form>
      {list && (
        <section className="ra-card" aria-labelledby="wa-h">
          <div className="ra-card-h"><div><h2 id="wa-h">{GROUPS[group!]}</h2>
            <div className="ra-note">Only people with a mobile number are listed. {list.people.length === 1 ? '1 person' : `${list.people.length} people`}{list.unusable ? `, and ${list.unusable === 1 ? '1 number' : `${list.unusable} numbers`} WhatsApp can’t use` : ''}. On a computer, WhatsApp Web opens; on a phone, the app.</div></div></div>
          <WhatsAppList people={list.people} label={`WhatsApp ${GROUPS[group!]}`} />
        </section>
      )}
    </div>
  );
}
