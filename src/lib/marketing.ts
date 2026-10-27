/* The public marketing homepage (MARKETING_SITE=1). Provisional product name, kept here so it can be renamed in one place. */
export const PRODUCT_NAME = 'Madressa System';

// Shown on the homepage. Temporary address until the domain's support@ mailbox exists.
export const CONTACT_EMAIL = 'muhammadowaislimbada@gmail.com';
// International format without + or spaces, for a wa.me link (opens a WhatsApp chat, not a call or text): +44 7918 535336.
export const WHATSAPP_NUMBER = '447918535336';

// The early-access form's choices; the server accepts only these.
export const EA_ROLES = ['Head teacher or imam', 'Administrator', 'Committee member', 'Teacher', 'Other'] as const;
export const EA_TYPES = ['Evening or weekend madressa / maktab', 'Mosque classes', 'Full-time Islamic school', 'Hifz or alim academy'] as const;
