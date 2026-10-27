import Link from 'next/link';
import { OFFER, PRODUCT_NAME } from '@/lib/marketing';
import { d } from './bits';
import { PageHero } from './PageHero';
import { Shell } from './Shell';

/* /faq (design-reference/website/faq.html). Each topic's first question starts open; topics alternate lavender and white. */
const TOC: [string, string][] = [
  ['cost', 'Cost & early access'],
  ['moving', 'Moving your data'],
  ['data', 'Data protection'],
  ['devices', 'Devices & everyday use'],
  ['fit', 'Will it fit our school?']
];

const TOPICS: { id: string; title: string; questions: [string, string][] }[] = [
  {
    id: 'cost', title: 'Cost & early access',
    questions: [
      ['How much does it cost?', `Nothing during early access. We’ll publish pricing before launch and tell early-access schools first. ${OFFER}`],
      ['What is early access?', `${PRODUCT_NAME} hasn’t launched yet. Early-access schools use the full system for free while we finish it, and we set it up with them personally. In return we ask for honest feedback.`],
      ['Is there a limit on places?', 'No. Any madressa, mosque or Islamic school can join.'],
      ['What happens when early access ends?', 'You decide whether to continue on the published price. If you leave, you can download your students, contacts, fees and registers as spreadsheets.'],
      ['Do I need a card to start?', 'No. Starting a trial only needs your school name and an email address.']
    ]
  },
  {
    id: 'moving', title: 'Moving your data',
    questions: [
      ['Can you move our records from spreadsheets or another system?', 'Yes, free of charge. Send us your spreadsheets or an export from your current system and we’ll import students, parents, classes and fees.'],
      ['We still use paper registers. Can you help?', 'Yes. We can start from a class list. Past attendance can be added later if you need it, or you can simply start fresh from your first evening.'],
      ['How long does setting up take?', 'It depends on how many classes and records you have. We agree a date with you, check everything together, and only then invite teachers and parents.'],
      ['Can we run it alongside our old system for a while?', 'Yes. You can start with registers and parent messages, and move fees over once you’re comfortable.']
    ]
  },
  {
    id: 'data', title: 'Data protection',
    questions: [
      ['Is it UK GDPR compliant?', 'Yes. Personal data is collected, stored and shared in line with UK GDPR.'],
      ['Who can see the children’s details?', 'Parents see only their own children. Teachers see only the classes they teach, and only the details you allow. Each office user gets the access level you choose.'],
      ['Is there a record of who changed what?', 'Yes. Important actions are recorded in an audit log with the person, date and page.'],
      ['What if something is deleted by mistake?', 'Records are backed up every night and can be restored. Bulk deletions need the school name typed in to confirm.']
    ]
  },
  {
    id: 'devices', title: 'Devices & everyday use',
    questions: [
      ['Do parents and teachers need to download an app?', 'No. Everything works in the phone’s web browser and can be added to the home screen so it opens like an app.'],
      ['What devices does it work on?', 'Android phones, iPhones, tablets, laptops and desktop computers with an up-to-date browser.'],
      ['Our volunteers aren’t very technical. Will they manage?', 'Taking a register is one tap per child, and parents report an absence in a few taps. We help you set up and train your team in the first weeks.'],
      ['Can we use a tablet by the door for teacher sign-in?', 'Yes. Teachers sign in and out on a shared tablet with their own PIN, or on their phone.'],
      ['Does it show Hijri dates?', 'Yes, alongside the usual date, in English or Arabic.']
    ]
  },
  {
    id: 'fit', title: 'Will it fit our school?',
    questions: [
      ['We run evening classes and weekend classes. Is that fine?', 'Yes. Each class has its own timetable by day, and registers follow it.'],
      ['Does it work for hifz and alim classes as well as maktab?', 'Yes. Classes, subjects, exams and reports are all yours to name and set up.'],
      ['We’re a full-time Islamic school. Is it for us?', 'Yes. Registers support DfE attendance codes, and you get full staff records, reports and safeguarding logs.'],
      ['We separate boys’ and girls’ classes. Can messaging respect that?', 'Yes. You can allow parents to message only teachers of the same gender, or switch any messaging route off.']
    ]
  }
];

export function FaqPage() {
  return (
    <Shell current="/faq">
      <PageHero title="Questions schools ask" lede={<>Straight answers about cost, your data and what it’s like to use. Can’t find yours? <a href="/contact">Ask us</a>.</>}>
        <nav className="toc" aria-label="Jump to a topic">{TOC.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
      </PageHero>
      {TOPICS.map((t, n) => (
        <section key={t.id} className={`section ${n % 2 ? 'field-white' : 'field-lav'}`} id={t.id} aria-labelledby={`t-${t.id}`}>
          <div className="wrap faq-grid">
            <div className="faq-side"><h2 id={`t-${t.id}`} data-rise>{t.title}</h2></div>
            <div className="faq-list" data-rise style={d(1)}>
              {t.questions.map(([q, a], i) => <details key={q} open={i === 0}><summary>{q}</summary><div className="answer"><p>{a}</p></div></details>)}
            </div>
          </div>
        </section>
      ))}
      <section className="section field-ink on-ink" aria-labelledby="close-title">
        <div className="wrap closing">
          <h2 id="close-title" data-rise>Still wondering?</h2>
          <div className="actions" data-rise style={d(1)}>
            <p className="on-ink-muted">Ask us anything by email or WhatsApp, or start your free trial and see for yourself.</p>
            <Link className="btn btn-sky" href="/#early-access">Start free trial</Link>
            <a className="sky-link" href="/contact">Contact us</a>
          </div>
        </div>
      </section>
    </Shell>
  );
}
