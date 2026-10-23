// §3 access levels, labelled for forms and lists.
export const ACCESS_LEVELS = [
  ['isSuper', 'Super (full access)'], ['canEdit', 'Can edit'], ['canDelete', 'Can delete'],
  ['feesAccess', 'Access fees area'], ['marketing', 'Marketing (newsletters and SMS)'], ['sendSms', 'Send SMS']
] as const;
