import { db } from '@/db';
import { countNotices, countPendingRequests } from '@/server/attendance/requests';
import { teacherParentNew, unreadCount } from '@/server/comm/messages';
import { todayIso } from '@/server/people/common';
import { partyUnread } from '@/server/portal/messages';
import type { AdminActor } from '@/server/next/actor';
import type { ParentUser, TeacherUser } from '@/server/next/portal';

/*
 * The numbers on the bell and message badges. Pages poll these (see LiveBadges) so a new message, holiday request or parent notice
 * shows up, with a sound, without reloading.
 */
export async function adminBadges(a: AdminActor) {
  const me = { id: a.staff.id, rank: a.staff.rank, isSuper: a.staff.isSuper };
  const [unread, teacherParent, notices, requests] = await Promise.all([unreadCount(db, me), teacherParentNew(db, a.staff.id), countNotices(db, todayIso()), countPendingRequests(db)]);
  return { messages: unread + teacherParent, notifications: notices + requests };
}

export const portalBadges = async (u: ParentUser | TeacherUser) => ({ messages: await partyUnread(db, u.party), notifications: 0 });
