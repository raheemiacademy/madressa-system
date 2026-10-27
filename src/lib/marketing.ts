/* The public marketing site (MARKETING_SITE=1): the homepage, /features, /faq and /contact. Provisional product name, kept here so it can be renamed in one place. */
export const PRODUCT_NAME = 'Madressa System';

// Shown on the homepage. Temporary address until the domain's support@ mailbox exists.
export const CONTACT_EMAIL = 'muhammadowaislimbada@gmail.com';
// International format without + or spaces, for a wa.me link (opens a WhatsApp chat, not a call or text): +44 7918 535336.
export const WHATSAPP_NUMBER = '447918535336';
export const WHATSAPP_DISPLAY = '+44 7918 535336';

export const OFFER = 'Early-access madressas keep their launch price fixed for as long as they stay with us.';

// The early-access form's choices; the server accepts only these.
export const EA_ROLES = ['Head teacher or imam', 'Administrator', 'Committee member', 'Teacher', 'Other'] as const;
export const EA_TYPES = ['Evening or weekend madressa / maktab', 'Mosque classes', 'Full-time Islamic school', 'Hifz or alim academy'] as const;
// The contact form's topics; the server accepts only these.
export const CONTACT_TOPICS = ['A question about features', 'Moving our records', 'Data protection', 'Early access', 'Something else'] as const;
