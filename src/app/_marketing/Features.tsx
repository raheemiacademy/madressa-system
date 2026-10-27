import Link from 'next/link';
import { d } from './bits';
import { PageHero } from './PageHero';
import { Shell } from './Shell';

/* /features (design-reference/website/features.html). Each area's first item is the wide one. */
const TOC: [string, string][] = [
  ['students', 'Students & families'],
  ['classes', 'Classes'],
  ['registers', 'Registers'],
  ['teachers', 'Teachers'],
  ['fees', 'Fees'],
  ['messages', 'Messages'],
  ['learning', 'Homework & reports'],
  ['merits', 'Merits'],
  ['events', 'Events'],
  ['safeguarding', 'Safeguarding'],
  ['apps', 'Apps'],
  ['admin', 'Settings & security']
];

const MODULES: { id: string; title: string; sub: string; items: [string, string][] }[] = [
  {
    id: 'students', title: 'Students & families', sub: 'Every child, every parent and how they’re connected.',
    items: [
      ['Online application form', 'Parents apply on your website. Applications arrive as a waiting list you can accept, place in a class or decline, with an admission fee if you charge one.'],
      ['Student records', 'Contact details, medical notes, photos, attachments, class history and your own custom fields.'],
      ['Statuses', 'Waiting list, accepted, current, on hold, suspended, left and finished, each with dates.'],
      ['Parents and contacts', 'Primary contacts, emergency contacts and who can see which child in the parent app.'],
      ['Siblings', 'Found automatically by surname and address, then used for family fees and discounts.'],
      ['Walk-home consent', 'Parents give consent in the app; teachers see it by class.'],
      ['Imports and exports', 'Bring students and contacts in from a spreadsheet and download them any time.']
    ]
  },
  {
    id: 'classes', title: 'Classes & timetables', sub: 'Maktab, hifz and alim classes, on whatever days you run.',
    items: [
      ['Classes with their own rules', 'Age group, main teacher, extra teachers with their own permissions, and fees per class or a school-wide default.'],
      ['Weekly timetables', 'Sessions by day with teacher, room and subject. Reuse a template across classes.'],
      ['Year and age groups', 'Set the age range for each group and see where every child fits.'],
      ['Moving up', 'A new-year wizard moves classes, timings and students into the next academic year.'],
      ['Class lists as PDFs', 'Printable summaries for one class or all of them.']
    ]
  },
  {
    id: 'registers', title: 'Registers & attendance', sub: 'Taken in a minute, understood at a glance.',
    items: [
      ['Daily registers on any device', 'Present, late, absent, left early, authorised or unauthorised. Use simple marks or DfE attendance codes.'],
      ['Parent notices', '“Absent today” and “running late” from the parent app, shown on the register and the office dashboard.'],
      ['Holiday requests', 'Accept as authorised or unauthorised, decline or ask for more information.'],
      ['Attendance records', 'Each child’s month-by-month record, minutes late and missed, with charts.'],
      ['Alerts', 'Emails when a child’s attendance drops below the level you set.'],
      ['Absence calendar and stats', 'By class, by month or any date range, with CSV downloads.'],
      ['Printable registers', 'Blank or filled-in, by class and month.']
    ]
  },
  {
    id: 'teachers', title: 'Teachers & staff', sub: 'Who works here, when, and what they can see.',
    items: [
      ['Sign in and out', 'On a kiosk with a PIN, in the teacher app, or logged by the office. Weekly summaries and an absence calendar.'],
      ['Teacher records', 'Contact details, DBS number and expiry, emergency contacts and working hours.'],
      ['Office staff and access levels', 'Give each person only the access they need, from full control to fees only.'],
      ['Class privileges', 'Choose what each teacher can do per class: registers, homework, merits, messages, reports.']
    ]
  },
  {
    id: 'fees', title: 'Fees', sub: 'Know who has paid, without a receipt book.',
    items: [
      ['Fee structures that make the invoices', 'Set fees per class: monthly, termly or per number of sessions, with due dates. Invoices are created through the year for you.'],
      ['Payments and receipts', 'Record cash, card or bank transfer payments and email a receipt.'],
      ['Reminders', 'Overdue, upcoming and active invoices, with a reminder email you can edit.'],
      ['Sibling discounts and adjustments', 'A discount for the second and third child, or a standing change for any family.'],
      ['Contributions', 'One-off charges for trips, books or the building fund, invoiced to the families you choose.'],
      ['Reports', 'Monthly and annual totals by invoice, student or family, with CSV downloads.'],
      ['Bank transfer references', 'A clear payment reference for each family so transfers are easy to match.']
    ]
  },
  {
    id: 'messages', title: 'Messages & newsletters', sub: 'One place for every conversation with families.',
    items: [
      ['Messages with rules', 'Parents, teachers and the office message each other only along the routes you allow. Lock a thread when it’s done.'],
      ['Newsletters', 'Email parents, a class, teachers or the waiting list, using your templates.'],
      ['Text messages', 'Send texts to groups or classes, with templates for absences, homework and fees.'],
      ['Templates you can edit', 'Every email and letter the system sends, in your own words.']
    ]
  },
  {
    id: 'learning', title: 'Homework, exams & reports', sub: 'Progress you can show parents.',
    items: [
      ['End-of-year reports', 'Exam results, attendance and homework pulled in for each child, teacher comments, and paragraph templates for behaviour, progress and effort. Generated as PDFs.'],
      ['Homework', 'For a class or chosen children, with deadlines, uploads and reminders.'],
      ['Exams and progress tests', 'Papers per subject, marks entry and your own grade boundaries.'],
      ['Subjects', 'Quran, Tajweed, Arabic, Fiqh, Seerah or your own, shared across timetables and reports.'],
      ['Forums', 'Class discussion spaces for teachers and parents.']
    ]
  },
  {
    id: 'merits', title: 'Merits & certificates', sub: 'Recognise effort, not just results.',
    items: [
      ['Merits and achievements', 'Award points, set milestones with bronze, silver and gold badges, and show them in the parent app.'],
      ['Certificates', 'Upload your certificate design once and print a named one for any child.'],
      ['Houses and competitions', 'Group classes or students into teams and run competitions between them.'],
      ['School shop', 'Sell books and uniform, or let children spend their merits.']
    ]
  },
  {
    id: 'events', title: 'Events & trips', sub: 'Opt-ins and consent without the paper slips.',
    items: [
      ['Events parents opt into', 'Dates, timeslots, deadlines, terms and consent items. An invoice is raised automatically when a parent opts in.'],
      ['School calendar and holidays', 'Shown in each app, with a newsletter to tell families.'],
      ['Calendar feed', 'Subscribe in any calendar app.']
    ]
  },
  {
    id: 'safeguarding', title: 'Safeguarding & safety', sub: 'Records you’ll be glad you kept.',
    items: [
      ['Fire drill', 'Hold one button for two seconds and every class gets a live roll call from tonight’s registers and sign-ins. Every drill is saved.'],
      ['Incidents', 'For students, teachers and staff, with severity, action taken, and the option to tell parents.'],
      ['Health and safety reports', 'Download incidents for any date range.'],
      ['Medical notes', 'Visible to the people who need them.']
    ]
  },
  {
    id: 'apps', title: 'Parent, teacher and student apps', sub: 'In the phone’s browser. Nothing to install from a store.',
    items: [
      ['You decide what each app shows', 'Hide fees, reports, homework or any other section, and choose which details teachers can see.'],
      ['Parent app', 'Attendance, homework, fees, reports, events, merits and messages for every child.'],
      ['Teacher app', 'Registers, homework, merits, incidents, report comments, sign-in and the fire drill.'],
      ['Student app', 'Their own homework and messages, if you switch it on.'],
      ['Hijri dates', 'Shown alongside the usual date, in English or Arabic.']
    ]
  },
  {
    id: 'admin', title: 'Settings & security', sub: 'Built to be trusted with children’s data.',
    items: [
      ['UK GDPR compliant', 'Role-based access, parents limited to their own children, and an audit log of important changes.'],
      ['Nightly backups', 'Restore if something goes wrong.'],
      ['Academic years', 'Switch between years and compare them.'],
      ['Your branding', 'Your logo, school details and email sender name on everything.'],
      ['Free data import', 'We move your existing records in for you.']
    ]
  }
];

export function Features() {
  return (
    <Shell current="/features">
      <PageHero title="Everything a madressa runs on" lede="From the first application form to the end-of-year report. Every part is included for every school in early access.">
        <nav className="toc" aria-label="Jump to a feature">{TOC.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
      </PageHero>
      <section className="section" aria-label="All features">
        <div className="wrap modules">
          {MODULES.map((m) => (
            <article className="module" id={m.id} key={m.id} aria-labelledby={`m-${m.id}`}>
              <div className="module-head" data-rise><h2 id={`m-${m.id}`}>{m.title}</h2><p>{m.sub}</p></div>
              <ul className="module-list" data-rise style={d(1)}>
                {m.items.map(([name, text], i) => <li key={name} className={i === 0 ? 'wide' : undefined}><strong>{name}</strong><span>{text}</span></li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>
      <section className="section field-ink on-ink" aria-labelledby="close-title">
        <div className="wrap closing">
          <h2 id="close-title" data-rise>Try all of it, free</h2>
          <div className="actions" data-rise style={d(1)}>
            <p className="on-ink-muted">Every feature is included during early access, and we’ll import your records for you.</p>
            <Link className="btn btn-sky" href="/#early-access">Start free trial</Link>
          </div>
        </div>
      </section>
    </Shell>
  );
}
