import { PRODUCT_NAME } from '@/lib/marketing';
import { d } from './bits';

const ROWS: [string, string, string][] = [
  ['Registers', 'A paper sheet per class, typed up later, if at all', 'Taken on the teacher’s phone in a minute. Attendance is ready before the first lesson ends'],
  ['Absences', 'Parents message whichever teacher they know', 'Parents report it in their app. It appears on that evening’s register'],
  ['Fees', 'A receipt book, a spreadsheet and awkward conversations at the door', 'Invoices made for you, every payment recorded, polite reminders sent for what’s overdue'],
  ['Parents', 'Announcements lost in busy group chats', 'Messages, homework and reports in one place for each family, with read receipts'],
  ['Teachers', 'Nobody is quite sure who turned up tonight', 'Teachers sign in and out on a kiosk or their phone. Cover is easy to spot'],
  ['Fire drill', 'A clipboard and a lot of shouting', 'One hold of a button gives every class a live roll call of who’s on site'],
  ['End of year', 'Reports written from memory in a weekend', 'Attendance, homework and exam results pulled into each child’s report for you']
];

export function Compare() {
  return (
    <section className="section field-white" aria-labelledby="compare-title">
      <div className="wrap">
        <div className="section-head">
          <h2 id="compare-title" data-rise>Paper, spreadsheets and twelve group chats</h2>
          <p data-rise style={d(1)}>That’s how most madressas run today, held together by a few tired volunteers. Here’s what changes when it all lives in one place.</p>
        </div>
        <div className="compare-wrap" data-rise style={d(2)} tabIndex={0} role="region" aria-labelledby="compare-title">{/* focusable so it can be scrolled from the keyboard on a phone */}
          <table className="compare">
            <caption className="vh">How running a madressa changes with {PRODUCT_NAME}</caption>
            <thead><tr><th scope="col">The job</th><th scope="col">Today</th><th scope="col">With {PRODUCT_NAME}</th></tr></thead>
            <tbody>
              {ROWS.map(([job, today, withUs]) => <tr key={job}><th scope="row">{job}</th><td className="old">{today}</td><td className="new">{withUs}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
