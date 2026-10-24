import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/db';
import { parentContext, PortalDenied, shows, teacherContext } from '@/server/portal/access';
import { sessionFor } from './actor';

/* Portal versions of requireAdmin: every portal page and server action calls one of these first. */

export const getParent = cache(async () => {
  const s = await sessionFor('parent');
  if (!s?.identity.contactId) return null;
  const ctx = await parentContext(db, s.identity.contactId).catch((e) => { if (e instanceof PortalDenied) return null; throw e; });
  if (!ctx) return null;
  return { identity: s.identity, ctx, actor: { identityId: s.identity.id, name: ctx.contact.name }, party: { kind: 'contact' as const, id: ctx.contact.id, name: ctx.contact.name } };
});
export type ParentUser = NonNullable<Awaited<ReturnType<typeof getParent>>>;

/** A signed-in parent whose portal is open, optionally checking a section the school can hide (hidden → 404). */
export async function requireParent(sectionName?: string): Promise<ParentUser> {
  const p = await getParent();
  if (!p) redirect('/parent/login');
  if (p.identity.mustChangePassword) redirect('/parent/change-password');
  if (p.ctx.tab.disabled) redirect('/parent/closed');
  if (sectionName && !shows(p.ctx, sectionName)) notFound();
  return p;
}

export const getTeacher = cache(async () => {
  const s = await sessionFor('teacher');
  if (!s?.identity.teacherId) return null;
  const ctx = await teacherContext(db, s.identity.teacherId).catch((e) => { if (e instanceof PortalDenied) return null; throw e; });
  if (!ctx) return null;
  return { identity: s.identity, ctx, actor: { identityId: s.identity.id, name: ctx.teacher.name }, party: { kind: 'teacher' as const, id: ctx.teacher.id, name: ctx.teacher.name } };
});
export type TeacherUser = NonNullable<Awaited<ReturnType<typeof getTeacher>>>;

/** A signed-in teacher, optionally checking a section the school can hide (hidden → 404). */
export async function requireTeacher(sectionName?: string): Promise<TeacherUser> {
  const t = await getTeacher();
  if (!t) redirect('/teacher/login');
  if (t.identity.mustChangePassword) redirect('/teacher/change-password');
  if (sectionName && !shows(t.ctx, sectionName)) notFound();
  return t;
}
