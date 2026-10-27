import { WhatsAppList } from '@/components/WhatsAppList';
import type { WaPerson } from '@/server/comm/whatsapp';

/** A closed card on a list page: open it to message each family on WhatsApp with the reminder already written. */
export function WhatsAppReminders({ title, list }: { title: string; list: { people: WaPerson[]; unusable: number } }) {
  if (!list.people.length && !list.unusable) return null;
  return (
    <details className="ra-card ra-wa-remind">
      <summary><span className="ra-wa-dot" aria-hidden="true" /><b>{title}</b> <span className="ra-muted">{list.people.length === 1 ? '1 family' : `${list.people.length} families`}{list.unusable ? ` · ${list.unusable} without a usable mobile` : ''}</span></summary>
      <p className="ra-note" style={{ margin: '4px 0 10px' }}>Each button opens WhatsApp with the message written; you press send. You can change the wording in WhatsApp first.</p>
      <WhatsAppList people={list.people} label={title} />
    </details>
  );
}
