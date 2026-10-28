import type { ReactNode } from 'react';
import { d, Digits, tone } from './bits';

function Chapter({ id, time, title, children, bullets, pic }: { id: string; time: string; title: string; children: ReactNode; bullets: string[]; pic: ReactNode }) {
  return (
    <article className="chapter" aria-labelledby={id}>
      <div className="chapter-copy" data-rise>
        <p className="chapter-time" aria-hidden="true">{time}</p>
        <h3 id={id}>{title}</h3>
        <p>{children}</p>
        <ul>{bullets.map((b) => <li key={b}>{b}</li>)}</ul>
      </div>
      <div className="chapter-pic" data-rise style={d(2)}>{pic}</div>
    </article>
  );
}

const Frag = ({ title, small, children }: { title: string; small: string; children: ReactNode }) => (
  <div className="frag" data-ui><div className="frag-inner"><div className="frag-title">{title} <small>{small}</small></div>{children}</div></div>
);

const MARKS: [string, ...string[]][] = [['Maryam Akhtar', 'P', 'P', 'P', 'P'], ['Ayaan Malik', 'P', 'L', 'P', 'P'], ['Hamza Javed', 'P', 'P', 'P', 'L'], ['Inaya Saleem', 'P', 'P', 'P', 'N'], ['Mikail Raza', 'U', 'P', 'P', 'P']];

/*
 * One evening, start to finish. On wide screens (Motion.tsx adds .pinned) the evening stays on screen while the visitor scrolls:
 * the clock runs from 4:45 to 8:00, each chapter takes its turn and the sky darkens (your request, 28/10/2026). Elsewhere, and
 * without JavaScript or with reduced motion, the chapters simply follow one another. The fire drill comes after, at any time.
 */
export function Chapters() {
  return (
    <section className="section field-lav tour" id="evening-tour" aria-labelledby="tour-title">
      <div className="tour-run"><div className="tour-stage"><div className="tour-sky" aria-hidden="true" />
      <div className="wrap">
        <div className="section-head">
          <h2 id="tour-title" data-rise>One evening, start to finish</h2>
          <p data-rise style={d(1)}>Follow a weekday at a madressa: from teachers arriving to the last message home. This is the system doing each job at its hour.</p>
        </div>
        <p className="tour-clock" aria-hidden="true"><Digits>4:45</Digits></p>
        <div className="chapters">
          <Chapter id="c1" time="4:45" title="Teachers sign in"
            bullets={['Kiosk PIN, phone or the office can log it', 'Weekly hours and absences for every teacher', 'DBS numbers and expiry dates kept with their record']}
            pic={<Frag title="Teacher sign-in" small="Thursday">
              <ul className="rows">
                <li><span className="av" style={tone('--g', 'action')}>BK</span><span className="grow">Ustadh Bilal Karim</span><span className="meta">16:41 · Kiosk</span></li>
                <li><span className="av" style={tone('--g', 'violet')}>HM</span><span className="grow">Ustadha Hafsa Malik</span><span className="meta">16:44 · Kiosk</span></li>
                <li><span className="av" style={{ ...tone('--g', 'blue'), color: 'var(--ink)' }}>HR</span><span className="grow">Ustadh Hamza Rafiq</span><span className="meta">16:48 · Phone</span></li>
                <li><span className="av" style={tone('--g', 'action')}>MA</span><span className="grow">Ustadha Maryam Ali</span><span className="meta">16:58 · Phone</span></li>
                <li><span className="av" style={tone('--g', 'muted')}>ZI</span><span className="grow">Ustadha Zainab Iqbal</span><span className="chip" style={tone('--c', 'bad')}>Not in yet</span></li>
              </ul>
            </Frag>}>
            Teachers tap in on a tablet by the door, or on their own phone. The office sees who’s here, who’s late and which class needs cover.
          </Chapter>

          <Chapter id="c2" time="5:00" title="Registers, in a minute"
            bullets={['Classic marks or DfE attendance codes', 'Authorised and unauthorised absences, minutes late', 'Monthly grids, attendance alerts and printable registers']}
            pic={<Frag title="Maktab 3B · October" small="View mode">
              <table className="reg">
                <thead><tr><th scope="col">Student</th><th scope="col">Mon 19</th><th scope="col">Tue 20</th><th scope="col">Wed 21</th><th scope="col">Thu 22</th></tr></thead>
                <tbody>{MARKS.map(([name, ...marks]) => <tr key={name}><td>{name}</td>{marks.map((m, i) => <td key={i}><span className={`mk ${m}`}>{m}</span></td>)}</tr>)}</tbody>
              </table>
            </Frag>}>
            Each teacher marks their class on their phone: present, late or absent. Children whose parents already sent a note are marked for them.
          </Chapter>

          <Chapter id="c3" time="5:10" title="Parents tell you, not the group chat"
            bullets={['Absence and late notices, holiday requests', 'Messages between parents, teachers and the office, with rules you control', 'Lock a thread when a conversation is finished']}
            pic={<Frag title="Fatima Siddiqui · Parent" small="16:47">
              <div className="bubble">Assalamu alaikum. Yusuf has a dentist appointment this afternoon so he will miss class today. He’ll catch up on the homework at the weekend.</div>
              <ul className="rows">
                <li><span className="grow">Marked on Maktab 2B register as <b>Notified</b></span><span className="chip" style={tone('--c', 'violet')}>Notified</span></li>
                <li><span className="grow">Office reply: “JazakAllah khair, noted.”</span><span className="meta">16:52</span></li>
              </ul>
            </Frag>}>
            Parents send “absent today” or “running late” from their phone. It lands on the right register, and the office can reply in the same thread.
          </Chapter>

          <Chapter id="c4" time="6:30" title="Homework goes home"
            bullets={['Deadlines, locking after the due date, file uploads', 'Reminders for work not handed in', 'A yearly record for every child']}
            pic={<Frag title="Surah Al-Mulk, ayat 1–10" small="Due Thursday 17:00">
              <ul className="rows">
                <li><span className="grow">Handed in</span><span className="meta">18 of 25</span></li>
                <li><span className="grow">Amina Hussain · recording.m4a</span><span className="chip" style={tone('--c', 'ok')}>Handed in</span></li>
                <li><span className="grow">Zayd Chowdhury · photo.jpg</span><span className="chip" style={tone('--c', 'ok')}>Handed in</span></li>
                <li><span className="grow">Musa Rahman</span><span className="chip" style={tone('--c', 'violet')}>Reminder sent</span></li>
              </ul>
            </Frag>}>
            Teachers set homework for a class or a few children. Parents see it that evening and can upload a recording or a photo of the work.
          </Chapter>

          <Chapter id="c5" time="7:00" title="Fees, without the awkward chats"
            bullets={['Monthly, termly or per-session fee structures', 'Sibling discounts, adjustments and one-off contributions', 'Receipts by email and a clear history for every family']}
            pic={<Frag title="Fees this year" small="£8,420 outstanding">
              <ul className="rows">
                <li><span className="grow">Yusuf Siddiqui</span><span className="meta">£45</span><span className="chip" style={tone('--c', 'blue')}>Processing</span></li>
                <li><span className="grow">Amina Hussain</span><span className="meta">£45</span><span className="chip" style={tone('--c', 'ok')}>Cleared</span></li>
                <li><span className="grow">Hana Patel</span><span className="meta">£90</span><span className="chip" style={tone('--c', 'ok')}>Cleared</span></li>
                <li><span className="grow">Musa Rahman</span><span className="meta">£135</span><span className="chip" style={tone('--c', 'bad')}>Overdue</span></li>
                <li><span className="grow">Reminders for 46 overdue invoices</span><span className="chip" style={tone('--c', 'violet')}>Sent 19:02</span></li>
              </ul>
            </Frag>}>
            Set your fees once per class. Invoices are made through the year, payments are recorded with receipts, and reminders go out for what’s overdue.
          </Chapter>
        </div>
        <div className="tour-bar" aria-hidden="true"><i /><span>4:30</span><span>5:30</span><span>6:30</span><span>7:30</span><span>8:00</span></div>
      </div>
      </div></div>
      <div className="wrap">
        <div className="chapters after-tour">
          <Chapter id="c6" time="Any time" title="Fire drill, in one hold"
            bullets={['Hold-to-start, so it can’t be set off by accident', 'Built from tonight’s registers and teacher sign-ins', 'A saved record of every drill']}
            pic={<div className="frag frag-drill" data-ui>
              <div className="drill">
                <p className="drill-title">Start a fire drill</p>
                <p className="drill-help">Press and hold for 2 seconds</p>
                <div className="hold" data-rise style={d(3)} aria-hidden="true"><span>Hold to start</span><span className="fill">Keep holding…</span></div>
              </div>
              <div className="drill-live" aria-hidden="true">
                <small>Fire drill live · 17:32</small><b>Everyone out</b>
                <p><span><span data-to="214"><Digits>214</Digits></span> of 214 children safe</span><span><span data-to="12"><Digits>12</Digits></span> of 12 staff</span></p>
              </div>
            </div>}>
            Press and hold for two seconds. Every class gets a live roll call of the children and staff signed in today, and teachers mark their class safe from their phone.
          </Chapter>
        </div>
      </div>
    </section>
  );
}
