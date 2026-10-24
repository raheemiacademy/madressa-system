import { PortalHead } from '@/app/_portal/Head';
import { TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireParent } from '@/server/next/portal';
import { holidayAction } from '../../actions';
import { NoKids } from '../../kids';

export const metadata = { title: 'Request a holiday' };

/** §6/§20 Holiday request: dates, which children, and where and why. The office accepts, declines or asks for more. */
export default async function Holiday() {
  const p = await requireParent('Holiday Requests');
  return (
    <>
      <PortalHead title="Request a holiday" back="/parent/attendance" />
      <main className="rp-main">
        {!p.ctx.kids.length ? <NoKids /> : (
          <Form action={holidayAction} submit="Send request" savebar={false} resetOnSuccess>
            <fieldset className="ra-fieldset">
              <legend>Children</legend>
              <div className="ra-checks">
                {p.ctx.kids.map((k, i) => <label key={k.id} className="ra-check"><input type="checkbox" name="studentIds" value={k.id} defaultChecked={i === 0} /> {k.label}</label>)}
              </div>
            </fieldset>
            <div className="ra-fields">
              <TextField name="startsOn" label="First day away" type="date" />
              <TextField name="endsOn" label="Last day away" type="date" />
              <TextArea name="request" label="Where and why" rows={4} />
            </div>
            <p className="ra-note">You’ll see the school’s answer on the Attendance page, and by email.</p>
          </Form>
        )}
      </main>
    </>
  );
}
