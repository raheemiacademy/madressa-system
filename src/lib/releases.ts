/*
 * What's new: one entry per update, newest first, in plain language for madrasah staff. Add an entry with every release;
 * the dashboard shows a "new update" banner until each admin has opened it.
 */

export type Release = {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  summary: string;
  changes: { kind: 'new' | 'better' | 'fixed' | 'removed'; text: string }[];
};

export const RELEASES: Release[] = [
  {
    version: '1.2', date: '2026-10-25', title: 'WhatsApp, easier importing, and this page',
    summary: 'Message families on WhatsApp, bring your records across from any spreadsheet, and see what’s changed in each update.',
    changes: [
      { kind: 'new', text: 'WhatsApp (Communication → WhatsApp): choose who, like the parents of a class, and the message, then work down the list. Each button opens WhatsApp with the message written; you press send.' },
      { kind: 'new', text: 'After a student incident, a “Tell the parents on WhatsApp” list with the message ready.' },
      { kind: 'new', text: 'Import from your own spreadsheet (CSV or Excel) in any layout: we match your columns to ours, you check them, see a preview, then import.' },
      { kind: 'new', text: 'A “Moving your data” guide, linked from the import pages.' },
      { kind: 'new', text: 'This What’s new page, and a note on the dashboard when there’s an update.' },
      { kind: 'better', text: 'Brothers and sisters who share a parent’s email are linked to the same parent when imported, instead of making copies.' },
      { kind: 'removed', text: 'Text messages and online card or direct-debit payments are switched off for now. Families pay by cash or bank transfer.' }
    ]
  },
  {
    version: '1.1', date: '2026-10-24', title: 'Ready for new madrasahs',
    summary: 'A new madrasah sets itself up in minutes, with a checklist that walks you through.',
    changes: [
      { kind: 'new', text: 'First-time setup: a new madrasah creates its first admin account with a setup code.' },
      { kind: 'new', text: '“Set up your madrasah” checklist on the dashboard, in six steps that tick themselves off as you go.' },
      { kind: 'new', text: 'Invite parents and teachers: everyone with an email gets a login and a link to choose their password.' },
      { kind: 'removed', text: 'Sticky notes.' }
    ]
  },
  {
    version: '1.0', date: '2026-10-24', title: 'The first version',
    summary: 'Everything to run a madrasah in one place, with apps for parents and teachers.',
    changes: [
      { kind: 'new', text: 'Students, parents, teachers and classes, with imports and registration forms.' },
      { kind: 'new', text: 'Registers, absences, holiday requests, teacher sign-in and fire drills.' },
      { kind: 'new', text: 'Fees: monthly invoices made for you, payments, receipts, reminders and reports.' },
      { kind: 'new', text: 'Messages, newsletters and email templates.' },
      { kind: 'new', text: 'Homework, exams, end-of-term reports, incidents, merits, the shop, events and forums.' },
      { kind: 'new', text: 'The dashboard: today’s figures at a glance.' },
      { kind: 'new', text: 'The parent and teacher apps, which install on phones.' },
      { kind: 'new', text: 'Backups, logs, email records and the System page.' }
    ]
  }
];

export const LATEST = RELEASES[0]!;
