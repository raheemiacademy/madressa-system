import type { adminStaff } from '@/db/schema';

type Staff = Pick<typeof adminStaff.$inferSelect, 'isSuper' | 'canEdit' | 'canDelete' | 'feesAccess' | 'marketing' | 'sendSms'>;

/** §3 access levels. Super implies everything; any signed-in staff member can view. */
export type AdminPerm = 'view' | 'edit' | 'delete' | 'fees' | 'marketing' | 'sms' | 'super';

export function adminCan(staff: Staff, perm: AdminPerm): boolean {
  if (staff.isSuper) return true;
  switch (perm) {
    case 'view': return true;
    case 'edit': return staff.canEdit;
    case 'delete': return staff.canDelete;
    case 'fees': return staff.feesAccess;
    case 'marketing': return staff.marketing;
    case 'sms': return staff.sendSms;
    case 'super': return false;
  }
}
