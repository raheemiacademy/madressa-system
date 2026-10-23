import { db } from '@/db';
import { enabledGroups, formWindow, registrationFields } from '@/server/people/registration';
import { getProfile } from '@/server/profile';
import { readTab } from '@/server/settings';
import { ApplyForm } from './ApplyForm';

const CLOSED = { disabled: 'Applications are not open at the moment.', 'not-yet': 'Applications haven’t opened yet. Please come back later.', closed: 'Applications have closed.' };

export async function ApplyPage({ kind }: { kind: 'child' | 'adult' }) {
  const [s, school, groups, fields] = await Promise.all([readTab(db, 'registration'), getProfile(db), enabledGroups(db), registrationFields(db)]);
  const state = kind === 'adult' && !s.adultEnabled ? 'disabled' : formWindow(s);
  return (
    <main className={`ra-apply ra-apply-${s.theme === 'classic' ? 'classic' : 'new'}`}>
      <div className="ra-apply-card">
        <div><div className="ra-muted" style={{ fontSize: 13 }}>{school?.name ?? 'School'}</div><h1>{kind === 'adult' ? 'Adult application' : 'Application form'}</h1></div>
        {s.header ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{String(s.header)}</p> : null}
        {state !== 'open' ? <p className="ra-banner" role="status" style={{ ['--c' as string]: 'var(--ra-blue)' }}>{CLOSED[state]}</p> : (
          <ApplyForm kind={kind} copySurname={!!s.copySurname}
            require={{ dob: !!s.requireDob, mobile: !!s.requireMobile, address: !!s.requireAddress, emergency: !!s.requireEmergency }}
            groups={groups.map((g) => ({ id: g.id, name: g.name, description: g.description, required: g.required, multipleChoice: g.multipleChoice }))}
            fields={fields.map((f) => ({ id: f.id, label: f.label, question: f.question, type: f.type, options: f.options, maxLength: f.maxLength }))} />
        )}
        {s.footer ? <p className="ra-note" style={{ whiteSpace: 'pre-wrap' }}>{String(s.footer)}</p> : null}
        <p className="ra-note">We use these details only to run the school and contact you about your application.</p>
      </div>
    </main>
  );
}
