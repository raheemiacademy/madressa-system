import type { IconName } from '@/components/Icon';
import type { TeacherUser } from '@/server/next/portal';
import { shows } from '@/server/portal/access';
import type { MenuItem } from '../../parent/(app)/menu';

/** Everything beyond the main tabs, for the More page and the desktop sidebar. Hidden sections aren't listed. */
export function teacherMenu(t: TeacherUser): MenuItem[] {
  return ([
    [null, '/teacher/classes', 'users', 'Classes and students', 'Class lists and student details'],
    ['Merits', '/teacher/merits', 'star', 'Merits', 'Award merits'],
    ['Incidents', '/teacher/incidents', 'alert', 'Incidents', 'Record an incident'],
    ['Exams|Progressive Tests', '/teacher/exams', 'exam', 'Exams and tests', 'Papers and results'],
    ['EOTY Reports', '/teacher/reports', 'exam', 'Report comments', 'End-of-term comments and scores'],
    ['Events', '/teacher/events', 'event', 'Events and trips', 'Who’s going'],
    ['Holiday Requests', '/teacher/holidays', 'calendar', 'Holiday requests', 'For students in your classes'],
    ['Forums', '/teacher/forums', 'chat', 'Forums', 'Talk with parents and colleagues'],
    ['Docs & Files', '/teacher/files', 'paperclip', 'Docs and files', 'Documents from the office'],
    ['Teacher Logs', '/teacher/logs', 'clock', 'My log', 'Sign-in and sign-out times'],
    [null, '/teacher/drill', 'alert', 'Fire drill', 'Roll call for your classes'],
    [null, '/teacher/change-password', 'lock', 'Change password', 'Choose a new password']
  ] as [string | null, string, IconName, string, string][])
    .filter(([s]) => !s || s.split('|').some((x) => shows(t.ctx, x)))
    .map(([, href, icon, label, desc]) => ({ href, icon, label, desc }));
}

export const teacherLinks = (t: TeacherUser) => (t.ctx.tab.customLinks as { label: string; url: string }[] | undefined) ?? [];
