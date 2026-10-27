import { d } from './bits';

const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export function SwitchAndData() {
  return (
    <section className="section field-white" aria-labelledby="switch-title">
      <div className="wrap duo">
        <div>
          <h2 id="switch-title" data-rise>We move your records for you</h2>
          <p className="lede" data-rise style={d(1)}>Bring your spreadsheets, paper lists or an export from another system. We import students, parents, classes and fees, free of charge.</p>
          <ol className="steps" data-rise style={d(2)}>
            <li><strong>Send us what you have</strong><span>Spreadsheets, exports or photos of the register. Whatever you keep today is fine.</span></li>
            <li><strong>We set up your madressa</strong><span>Classes, timetables, fee structures and families, checked with you before anyone logs in.</span></li>
            <li><strong>Invite your teachers and parents</strong><span>They get a link by email and set their own password. We’re on hand for the first weeks.</span></li>
          </ol>
        </div>
        <div>
          <h2 id="data-title" data-rise>Children’s data, handled properly</h2>
          <p className="lede" data-rise style={d(1)}>You are trusted with information about other people’s children. The system is built around keeping it safe.</p>
          <ul className="points" data-rise style={d(2)}>
            <li><svg {...svg}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg><div><strong>UK GDPR compliant</strong>Personal data is collected, stored and shared in line with UK GDPR.</div></li>
            <li><svg {...svg}><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="m17 11 2 2 4-4" /></svg><div><strong>Parents see only their own children</strong>Teachers see only the classes they teach. Office staff get the access levels you choose.</div></li>
            <li><svg {...svg}><path d="M4 4h16v16H4z" /><path d="M8 9h8M8 13h8M8 17h5" /></svg><div><strong>Every important change is logged</strong>An audit trail records who changed what, so nothing happens quietly.</div></li>
            <li><svg {...svg}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg><div><strong>Nightly backups</strong>Your records are backed up every night and can be restored.</div></li>
          </ul>
        </div>
      </div>
    </section>
  );
}
