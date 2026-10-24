import { PortalHead } from '@/app/_portal/Head';
import { TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireParent } from '@/server/next/portal';
import { todayIso } from '@/server/people/common';
import { noticeAction } from '../../actions';
import { NoKids, pickKid } from '../../kids';

export const metadata = { title: 'Let the school know' };

/** §20 "Will be absent / late" notice (design: ParentAbsence). It reaches the class teacher's register and the office. */
export default async function Notice({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const p = await requireParent('Attendance');
  const kid = pickKid(p, (await searchParams).child);
  return (
    <>
      <PortalHead title="Let the school know" back="/parent/attendance" />
      <main className="rp-main">
        {!kid ? <NoKids /> : (
          <Form action={noticeAction} submit="Send to the school" savebar={false} resetOnSuccess>
            <fieldset className="ra-fieldset">
              <legend>Who</legend>
              <div className="ra-checks">
                {p.ctx.kids.map((k) => <label key={k.id} className="ra-check"><input type="radio" name="studentId" value={k.id} defaultChecked={k.id === kid.id} /> {k.label}{k.className ? ` · ${k.className}` : ''}</label>)}
              </div>
            </fieldset>
            <fieldset className="ra-fieldset">
              <legend>They will be</legend>
              <div className="ra-checks">
                <label className="ra-check"><input type="radio" name="kind" value="absent" defaultChecked /> Absent</label>
                <label className="ra-check"><input type="radio" name="kind" value="late" /> Late</label>
              </div>
            </fieldset>
            <div className="ra-fields">
              <TextField name="date" label="Day" type="date" defaultValue={todayIso()} min={todayIso()} />
              <TextField name="expectedArrival" label="Expected arrival (if late)" type="time" />
              <TextArea name="reason" label="Reason (optional)" rows={3} enterKeyHint="send" placeholder="For example, a dentist appointment" />
            </div>
            <p className="ra-note">This goes straight to the class teacher and the office. The office decides whether it counts as authorised.</p>
          </Form>
        )}
      </main>
    </>
  );
}
