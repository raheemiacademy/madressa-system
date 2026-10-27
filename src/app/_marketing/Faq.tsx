import { OFFER } from '@/lib/marketing';
import { d } from './bits';

const QUESTIONS: [string, string][] = [
  ['How much does it cost?', `Nothing during early access. We’ll publish pricing before launch and tell early-access schools first, so you can decide whether to carry on. ${OFFER}`],
  ['What happens when early access ends?', 'You choose whether to continue. Your records are yours: you can download students, contacts, fees and registers as spreadsheets at any time.'],
  ['Can you move our records from spreadsheets or another system?', 'Yes, and it’s free. Send us what you have and we’ll import your students, parents, classes and fees, then check everything with you before teachers and parents are invited.'],
  ['Is it UK GDPR compliant? Who can see the children’s details?', 'Yes. Parents see only their own children, teachers see only the classes they teach, and you decide what each office user can do. Important changes are recorded in an audit log.'],
  ['Do parents and teachers need to download an app?', 'No. Everything works in the phone’s web browser and can be added to the home screen like an app. It also works on tablets, laptops and desktop computers.'],
  ['Our volunteers aren’t very technical. Will they manage?', 'Taking a register is one tap per child, and parents report an absence in a few taps. We’ll help you set up and train your team in the first weeks.']
];

export function Faq() {
  return (
    <section className="section field-lav" aria-labelledby="faq-title">
      <div className="wrap faq-grid">
        <div className="faq-side">
          <h2 id="faq-title" data-rise>Questions schools ask</h2>
          <p data-rise style={d(1)}>Something we haven’t answered? <a href="/contact">Ask us directly</a> or read <a href="/faq">all the questions</a>.</p>
        </div>
        <div className="faq-list" data-rise style={d(1)}>
          {QUESTIONS.map(([q, a]) => <details key={q}><summary>{q}</summary><div className="answer"><p>{a}</p></div></details>)}
        </div>
      </div>
    </section>
  );
}
