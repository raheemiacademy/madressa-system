import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { academicYear, classTeacher, schoolClass } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { ActionButton } from '@/components/Form';
import { Icon } from '@/components/Icon';
import { formatCalendarDate, formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { PRIVILEGES } from '@/server/people/classes';
import { todayIso } from '@/server/people/common';
import { answersFor, answerText } from '@/server/people/custom-fields';
import { getTeacher } from '@/server/people/teachers';
import { deleteTeacherAction } from '../actions';

export const metadata = { title: 'Teacher' };
const DAY = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const mask = (v: string) => (v ? `•••• ${v.slice(-3)}` : '—');

export default async function TeacherProfile({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  const t = Number.isInteger(id) ? await getTeacher(db, id) : null;
  if (!t) notFound();
  const [classes, cf] = await Promise.all([
    db.select({ ct: classTeacher, c: schoolClass, year: academicYear.title, isCurrent: academicYear.isCurrent }).from(classTeacher)
      .innerJoin(schoolClass, eq(schoolClass.id, classTeacher.classId)).innerJoin(academicYear, eq(academicYear.id, schoolClass.academicYearId)).where(eq(classTeacher.teacherId, id)),
    answersFor(db, 'teacher', id)
  ]);
  const dbsExpired = t.dbsExpiresOn && t.dbsExpiresOn < todayIso();
  const row = (k: string, v: React.ReactNode) => <><dt>{k}</dt><dd>{v || '—'}</dd></>;
  return (
    <div className="ra-page">
      <div className="ra-page-h">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- private uploaded photo */}
          {t.photoFileId ? <img className="ra-photo" src={`/admin/files/${t.photoFileId}`} alt="" /> : null}
          <div><h1>{t.name}</h1><p>Teacher #{t.id} · <Chip>{t.status}</Chip></p></div>
        </div>
        <div className="ra-toolbar">
          {adminCan(admin.staff, 'edit') && <Link className="ra-btn primary" href={`/admin/teachers/${id}/edit`}><Icon name="edit" />Edit</Link>}
          <Link className="ra-btn" href={`/admin/teachers/hours?teacher=${id}`}>Work hours</Link>
        </div>
      </div>
      <div className="ra-grid">
        <section className="ra-card ra-c6"><div className="ra-card-h"><div><h2>Details</h2></div></div>
          <dl className="ra-dl">
            {row('Email', t.email)}{row('Telephone', t.tel)}{row('Mobile', t.mobile)}{row('Gender', t.gender)}
            {row('Date of birth', t.dob && formatCalendarDate(t.dob))}{row('Start date', t.startDate && formatCalendarDate(t.startDate))}{row('Left date', t.leftDate && formatCalendarDate(t.leftDate))}
            {row('Address', [t.address, t.postcode].filter(Boolean).join('\n'))}
            {row('Teacher portal', t.login ? `${t.login.email}${t.login.lastLoginAt ? `, last signed in ${formatInstant(t.login.lastLoginAt, 'dd/MM/yyyy')}` : ''}` : 'No login')}
            {row('Kiosk PIN', t.hasKioskPin ? 'Set' : 'Not set')}
            {cf.fields.map((f) => <span key={f.id} style={{ display: 'contents' }}>{row(f.label, answerText(cf.values[f.id]))}</span>)}
          </dl></section>
        <section className="ra-card ra-c6"><div className="ra-card-h"><div><h2>Checks, pay and health</h2><div className="ra-note">Shown masked. Open Edit to see them in full.</div></div></div>
          <dl className="ra-dl">
            {row('DBS number', t.dbsNumber)}
            {row('DBS issued', t.dbsIssuedOn && formatCalendarDate(t.dbsIssuedOn))}
            {row('DBS expires', t.dbsExpiresOn && <span className={dbsExpired ? 'ra-warn' : undefined}>{formatCalendarDate(t.dbsExpiresOn)}{dbsExpired ? ' · expired' : ''}</span>)}
            {row('NI number', mask(t.niNumber))}{row('Bank account', t.bankAccount ? `${t.bankName ? `${t.bankName}, ` : ''}${mask(t.bankAccount)}` : '')}
            {row('Medical information', t.medical ? 'On file' : '')}
          </dl>
          <h3 style={{ margin: 0, fontSize: 14 }}>Emergency contacts</h3>
          {t.emergency.length === 0 ? <p className="ra-empty">None recorded.</p> : <ul style={{ margin: 0, paddingLeft: 18 }}>{t.emergency.map((e) => <li key={e.id}>{e.name}{e.relation ? ` (${e.relation})` : ''}{e.phone ? `, ${e.phone}` : ''}</li>)}</ul>}
        </section>
        <section className="ra-card ra-c6"><div className="ra-card-h"><div><h2>Working hours</h2></div></div>
          {t.hours.length === 0 ? <p className="ra-empty">Not set yet.</p> : <table className="ra-table"><tbody>{t.hours.map((h) => <tr key={h.weekday}><td>{DAY[h.weekday]}</td><td>{h.startTime.slice(0, 5)} – {h.endTime.slice(0, 5)}</td></tr>)}</tbody></table>}
        </section>
        <section className="ra-card ra-c6"><div className="ra-card-h"><div><h2>Classes and portal privileges</h2></div></div>
          {classes.length === 0 ? <p className="ra-empty">Not assigned to any classes.</p> : (
            <table className="ra-table"><thead><tr><th>Class</th><th>Year</th><th>Privileges</th></tr></thead>
              <tbody>{classes.map(({ ct, c, year }) => <tr key={c.id}><td className="wrap"><Link href={`/admin/classes/${c.id}`}>{c.name}</Link></td><td>{year}</td>
                <td className="wrap">{PRIVILEGES.filter(([k]) => ct[k]).map(([, l]) => l).join(', ') || 'None'}</td></tr>)}</tbody></table>
          )}
        </section>
      </div>
      {adminCan(admin.staff, 'delete') && <section className="ra-card"><div className="ra-card-h"><div><h2>Delete teacher</h2><div className="ra-note">Removes their portal login. Their name stays on past records.</div></div>
        <ActionButton action={deleteTeacherAction.bind(null, id)} label="Delete teacher" confirm={`Delete ${t.name}?`} danger /></div></section>}
    </div>
  );
}
