import type { CSSProperties } from 'react';
import { d } from './bits';

const REGISTER: [string, 'P' | 'L' | 'A'][] = [['Maryam Akhtar', 'P'], ['Ayaan Malik', 'P'], ['Hamza Javed', 'L'], ['Inaya Saleem', 'A'], ['Mikail Raza', 'P'], ['Sumaya Haider', 'P'], ['Yahya Bashir', 'P'], ['Zara Qadir', 'P'], ['Eesa Rahim', 'P']];

export function Phones() {
  return (
    <section className="section field-ink on-ink" aria-labelledby="apps-title">
      <div className="wrap">
        <div className="section-head">
          <h2 id="apps-title" data-rise>An app for the office, teachers and parents</h2>
          <p data-rise style={{ ...d(1), color: 'var(--on-ink-muted)' } as CSSProperties}>Each person sees only what they need. They open in the phone’s browser and can be added to the home screen. Nothing to download from an app store.</p>
        </div>
        <div className="phones">
          <figure className="phone-fig" data-rise>
            <div className="phone" data-ui aria-hidden="true">
              <div className="ph-head"><div><small>Madressa admin</small><b>Thursday 22 October</b></div></div>
              <div className="ph-body">
                <div className="ph-hero"><big>Good evening</big><span>Attendance is 93.2% today. 46 invoices are overdue.</span></div>
                <div className="ph-pair">
                  <div className="ph-card"><small className="ph-dim">Students</small><div className="ph-num">214</div></div>
                  <div className="ph-card"><small className="ph-dim">Outstanding</small><div className="ph-num">£8,420</div></div>
                </div>
                <div className="ph-card"><b>4</b> parents reported an absence today</div>
                <div className="ph-card"><b>3</b> holiday requests to decide</div>
                <div className="ph-card"><b>Unread messages</b><div className="ph-row"><span>Fatima Siddiqui</span><span className="ph-dim">17:42</span></div><div className="ph-row"><span>Ustadh Bilal Karim</span><span className="ph-dim">16:58</span></div></div>
                <div className="ph-card ph-alert"><b>Fire drill</b> · hold to start</div>
              </div>
              <div className="ph-tabs"><span className="on">Home</span><span>Students</span><span>Fees</span><span>Messages</span></div>
            </div>
            <figcaption><h3>For the office</h3><p>Students, fees, messages and the fire drill, from anywhere. See the evening at a glance before you reach the mosque.</p></figcaption>
          </figure>
          <figure className="phone-fig" data-rise style={d(1)}>
            <div className="phone" data-ui aria-hidden="true">
              <div className="ph-head"><div><small>Thu 22 Oct · 17:00</small><b>Maktab 3B register</b></div></div>
              <div className="ph-body">
                <div className="ph-card tight">
                  {REGISTER.map(([name, mark]) => (
                    <div className="ph-row" key={name}><span>{name}</span><span className="ph-seg">
                      {(['P', 'L', 'A'] as const).map((m) => <i key={m} className={m === mark ? (m === 'A' ? 'on a' : 'on') : undefined}>{m}</i>)}
                    </span></div>
                  ))}
                </div>
                <div className="ph-btn">Save register</div>
              </div>
              <div className="ph-tabs"><span>Today</span><span className="on">Register</span><span>Homework</span><span>Messages</span></div>
            </div>
            <figcaption><h3>For teachers</h3><p>Today’s classes, the register, homework, merits and messages. Signing in and out is one tap.</p></figcaption>
          </figure>
          <figure className="phone-fig" data-rise style={d(2)}>
            <div className="phone" data-ui aria-hidden="true">
              <div className="ph-head"><div><small>Thursday 22 October</small><b>Hello, Fatima</b></div></div>
              <div className="ph-body">
                <div className="ph-hero"><span>Yusuf · Maktab 2B</span><big>Next class today, 5:00 pm</big><span>94.0% attendance · 1 homework due</span></div>
                <div className="ph-card"><b>Report absent or late</b></div>
                <div className="ph-card"><b>£45 due on 1 November</b><br /><span className="ph-dim">November fees · both children</span></div>
                <div className="ph-card"><b>From the school</b><br /><span className="ph-dim">Half-term: no classes 26–30 October.</span></div>
                <div className="ph-card"><b>Homework due today</b><br /><span className="ph-dim">Surah Al-Mulk, ayat 1–10 · add a recording</span></div>
                <div className="ph-card"><b>12 merits</b> this term<br /><span className="ph-dim">Next badge: silver at 15</span></div>
              </div>
              <div className="ph-tabs"><span className="on">Home</span><span>Attendance</span><span>Fees</span><span>Homework</span></div>
            </div>
            <figcaption><h3>For parents</h3><p>Every child in one place: attendance, homework, fees, reports and messages, plus a quick way to say they’ll be absent.</p></figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
