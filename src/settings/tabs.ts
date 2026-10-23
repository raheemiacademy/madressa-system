import { z } from 'zod';
import { parsePounds } from '@/lib/money';

/**
 * §4 Settings tabs. Each field definition drives both the generic form and the server-side
 * Zod schema, so a tab can't render a field the server doesn't validate (or vice versa).
 */
type Opt = { value: string; label: string };
type Base = { name: string; label: string; help?: string; full?: boolean };
export type Field = Base & (
  | { type: 'text' | 'textarea'; default?: string; max?: number; pattern?: RegExp; patternMessage?: string }
  | { type: 'email' | 'url'; default?: string }
  | { type: 'int'; default: number; min: number; max: number }
  | { type: 'money'; default: number } // stored as integer pence
  | { type: 'toggle'; default: boolean }
  | { type: 'select'; options: Opt[]; default: string }
  | { type: 'checks'; options: Opt[]; default: string[] }
  | { type: 'extensions'; default: string[] }
  | { type: 'links'; default?: [] }
  | { type: 'secret' }
  | { type: 'file'; accept: string; kind: 'image' | 'video' }
);
export type Tab = { key: string; title: string; group: string; description: string; fields: Field[] };

const opts = (...pairs: [string, string][]): Opt[] => pairs.map(([value, label]) => ({ value, label }));
const yes = (name: string, label: string, def = false, help?: string): Field => ({ type: 'toggle', name, label, default: def, help });

export const LINK_ICONS = opts(['link', 'Link'], ['globe', 'Website'], ['book', 'Book'], ['calendar', 'Calendar'], ['mail', 'Email'], ['phone', 'Phone'], ['file', 'Document'], ['video', 'Video']);
export const PALETTE_COLOURS = opts(['lav', 'Lavender'], ['sky', 'Sky'], ['blue', 'Blue'], ['indigo', 'Indigo'], ['violet', 'Violet']);

export const REFERENCE_VARIABLES = ['CONTACT_ID', 'DATE_YMD', 'DATE_DMY', 'DATE_MDY', 'D', 'M', 'Y', 'STUDENT_IDS', 'NUMBER_OF_INVOICES'] as const;

const PARENT_SECTIONS = ['Fees', 'Attendance', 'Term Reports', 'Exam Results', 'Student Diaries', 'Homework', 'Events', 'Incidents', 'Holiday Requests', 'Merits', 'Products', 'Files'];
const TEACHER_SECTIONS = ['Registers', 'Diary', 'Teacher Logs', 'Forums', 'Merits', 'Homework', 'Incidents', 'Exams', 'Progressive Tests', 'EOTY Reports', 'Events', 'Docs & Files', 'Holiday Requests'];
const asOpts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

const timeZones = (): Opt[] => {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Europe/London'];
  return asOpts(zones.includes('Europe/London') ? zones : ['Europe/London', ...zones]);
};

export const TABS: Tab[] = [
  {
    key: 'local', title: 'Local settings', group: 'General', description: 'Timezone, date formats, currency, PDF page size and Hijri dates.',
    fields: [
      { type: 'select', name: 'timezone', label: 'Timezone', options: timeZones(), default: 'Europe/London' },
      { type: 'select', name: 'shortDate', label: 'Short date format', default: 'dd/MM/yyyy', options: opts(['dd/MM/yyyy', '23/10/2026'], ['dd-MM-yyyy', '23-10-2026'], ['dd.MM.yyyy', '23.10.2026'], ['yyyy-MM-dd', '2026-10-23'], ['MM/dd/yyyy', '10/23/2026']) },
      { type: 'select', name: 'longDate', label: 'Long date format', default: 'EEEE d MMMM yyyy', options: opts(['EEEE d MMMM yyyy', 'Friday 23 October 2026'], ['d MMMM yyyy', '23 October 2026'], ['EEE d MMM yyyy', 'Fri 23 Oct 2026'], ['d MMM yyyy', '23 Oct 2026']) },
      { type: 'text', name: 'currencySymbol', label: 'Currency symbol', default: '£', max: 4 },
      { type: 'text', name: 'currencyCode', label: 'Currency code', default: 'GBP', pattern: /^[A-Z]{3}$/, patternMessage: 'Use a three-letter code such as GBP.' },
      { type: 'select', name: 'pdfPageSize', label: 'Default PDF page size', default: 'A4-portrait', options: opts(['A4-portrait', 'A4 portrait'], ['A4-landscape', 'A4 landscape'], ['A5-portrait', 'A5 portrait'], ['A5-landscape', 'A5 landscape'], ['Letter-portrait', 'US Letter']) },
      { type: 'select', name: 'hijriLanguage', label: 'Hijri date language', default: 'en', options: opts(['en', 'English'], ['ar', 'Arabic']) },
      { type: 'select', name: 'hijriFormat', label: 'Hijri date format', default: 'long', options: opts(['long', '11 Jumada al-Ula 1448'], ['weekday', 'Friday 11 Jumada al-Ula 1448'], ['numeric', '11/5/1448']) },
      { type: 'int', name: 'hijriOffset', label: 'Hijri date offset (days)', default: 0, min: -3, max: 3, help: 'Moves Hijri dates to match local moon sighting.' }
    ]
  },
  {
    key: 'fees', title: 'Fees settings', group: 'Finance', description: 'Receipts, admission fees and bank transfer details shown to parents.',
    fields: [
      yes('feeNotesOnReceipts', 'Include fee notes on receipts'),
      { type: 'money', name: 'admissionFee', label: 'Admission fee amount', default: 0 },
      yes('admissionInvoiceOnApplication', 'Create an admission fee invoice when an application form is submitted'),
      yes('bankTransferEnabled', 'Offer bank transfer to parents'),
      { type: 'text', name: 'bankAccountName', label: 'Account name', max: 120 },
      { type: 'text', name: 'bankAccountNumber', label: 'Account number', pattern: /^\d{8}$/, patternMessage: 'Use the 8-digit account number.' },
      { type: 'text', name: 'bankSortCode', label: 'Sort code', pattern: /^\d{2}-?\d{2}-?\d{2}$/, patternMessage: 'Use the format 12-34-56.' },
      { type: 'text', name: 'bankIban', label: 'IBAN', max: 34 },
      { type: 'text', name: 'bankSwift', label: 'SWIFT / BIC', max: 11 },
      {
        type: 'text', name: 'bankReference', label: 'Payment reference template', full: true, default: 'MADRASAH-FEES-{DATE_YMD}-S{STUDENT_IDS}', max: 60,
        help: `Variables: ${REFERENCE_VARIABLES.map((v) => `{${v}}`).join(', ')}. {STUDENT_IDS} joins IDs with hyphens.`
      }
    ]
  },
  {
    key: 'fire', title: 'Fire drills', group: 'School', description: 'How fire drills start and who is told.',
    fields: [
      yes('processWithoutConfirmation', 'Process attendance without confirmation'),
      yes('emailAllAdmins', 'Email all admins when a drill starts', true),
      yes('emailClassAttendance', 'Email class attendance to teachers', true),
      { type: 'checks', name: 'buttonPlaces', label: 'Show the fire drill button in', default: ['menu'], options: opts(['menu', 'Side menu'], ['dashboard', 'Dashboard'], ['header', 'Header']) },
      yes('teachersCanStart', 'Let teachers start a drill from the teacher portal')
    ]
  },
  {
    key: 'storage', title: 'File storage', group: 'System', description: 'Space for uploaded files and the file types the school accepts.',
    fields: [
      { type: 'int', name: 'limitMb', label: 'Storage limit (MB)', default: 1024, min: 50, max: 102400 },
      { type: 'extensions', name: 'allowedExtensions', label: 'Allowed file extensions', full: true, default: ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'mp3', 'm4a', 'wav', 'mp4', 'mov'] }
    ]
  },
  {
    key: 'homework', title: 'Homework', group: 'Learning', description: 'Which files teachers and parents may upload with homework.',
    fields: [
      { type: 'extensions', name: 'teacherExtensions', label: 'File extensions teachers may upload', full: true, default: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'mp3', 'm4a', 'mp4'] },
      { type: 'extensions', name: 'parentBlocked', label: 'Extensions blocked for parents', full: true, default: ['exe', 'bat', 'cmd', 'com', 'js', 'msi', 'scr', 'vbs', 'ps1', 'html', 'htm', 'svg'] },
      { type: 'email', name: 'bcc', label: 'BCC address for homework emails' }
    ]
  },
  {
    key: 'mail', title: 'Mail / SMTP', group: 'Communication', description: 'Send email through the system mail server or your own SMTP server.',
    fields: [
      { type: 'select', name: 'mode', label: 'Mail server', default: 'system', options: opts(['system', 'System mail server'], ['private', 'Private SMTP server']) },
      { type: 'text', name: 'host', label: 'SMTP host', max: 200 },
      { type: 'int', name: 'port', label: 'Port', default: 587, min: 1, max: 65535 },
      { type: 'select', name: 'encryption', label: 'Encryption', default: 'tls', options: opts(['none', 'None'], ['ssl', 'SSL'], ['tls', 'TLS']) },
      { type: 'email', name: 'sender', label: 'Sender email' },
      { type: 'int', name: 'perMinute', label: 'Emails per minute', default: 30, min: 1, max: 1000 },
      { type: 'text', name: 'username', label: 'Username', max: 200 },
      { type: 'secret', name: 'password', label: 'Password' }
    ]
  },
  {
    key: 'messaging', title: 'Messaging', group: 'Communication', description: 'Allow or block each messaging route. Blocked routes are refused by the server.',
    fields: [
      yes('teachersToAdmins', 'Teachers → Admins', true),
      yes('teachersToPrimaryContacts', 'Teachers → Primary contacts', true),
      yes('teachersToClassStudents', 'Teachers → Class students'),
      yes('teachersToTeachers', 'Teachers → Teachers', true),
      yes('contactsToAdmins', 'Contacts → Admins', true),
      yes('contactsToTeachersAll', 'Contacts → Teachers (all genders)'),
      yes('contactsToTeachersSameGender', 'Contacts → Teachers (same gender only)'),
      yes('studentsToAdmins', 'Students → Admins'),
      yes('studentsToTeachers', 'Students → Teachers')
    ]
  },
  {
    key: 'register', title: 'Register', group: 'School', description: 'Register order and type. DfE attendance codes are managed on the Register pages.',
    fields: [
      { type: 'select', name: 'orderBy', label: 'Order registers by', default: 'firstName', options: opts(['firstName', 'First name'], ['surname', 'Surname']) },
      { type: 'select', name: 'type', label: 'Register type', default: 'classic', options: opts(['classic', 'Classic (present, absent, late, authorised, unauthorised, notified)'], ['dfe', 'DfE attendance codes']) }
    ]
  },
  {
    key: 'spell', title: 'Spell checker', group: 'System', description: 'GrammarBot service used to check spelling in reports and messages.',
    fields: [
      { type: 'url', name: 'host', label: 'GrammarBot host' },
      { type: 'secret', name: 'apiKey', label: 'API key' }
    ]
  },
  {
    key: 'parentPortal', title: 'Parent portal', group: 'Portals', description: 'What parents see and can do. Hidden sections are blocked on the server, not just hidden.',
    fields: [
      { type: 'file', name: 'loginBackground', label: 'Login background image', accept: 'image/png,image/jpeg,image/webp', kind: 'image' },
      { type: 'url', name: 'website', label: 'Website' },
      { type: 'email', name: 'socialEmail', label: 'Email' },
      { type: 'url', name: 'twitter', label: 'Twitter / X' },
      { type: 'url', name: 'facebook', label: 'Facebook' },
      { type: 'url', name: 'instagram', label: 'Instagram' },
      { type: 'url', name: 'linkedin', label: 'LinkedIn' },
      { type: 'url', name: 'whatsapp', label: 'WhatsApp link' },
      { type: 'links', name: 'customLinks', label: 'Custom links', full: true },
      yes('disabled', 'Disable the parent portal'),
      { type: 'textarea', name: 'disabledMessage', label: 'Message shown while disabled', full: true, max: 1000 },
      yes('walkHomeConsent', 'Ask for walk-home consent'),
      yes('forceDirectDebit', 'Make parents set up direct debit'),
      yes('forceConfirmDetails', 'Make parents confirm student details'),
      { type: 'checks', name: 'hiddenSections', label: 'Hide sections', full: true, default: [], options: asOpts(PARENT_SECTIONS) },
      { type: 'checks', name: 'contactTypesAllowed', label: 'Contact types that can use the portal', full: true, default: ['Parent'], options: asOpts(['Parent', 'Sibling', 'Emergency', 'Other']) }
    ]
  },
  {
    key: 'studentPortal', title: 'Student portal', group: 'Portals', description: 'Links shown on the student portal.',
    fields: [{ type: 'links', name: 'customLinks', label: 'Custom links', full: true }]
  },
  {
    key: 'teacherPortal', title: 'Teacher portal', group: 'Portals', description: 'What teachers see. Per-class privileges are set on each class.',
    fields: [
      { type: 'file', name: 'loginBackgroundVideo', label: 'Login background video', accept: 'video/mp4,video/webm', kind: 'video' },
      { type: 'links', name: 'customLinks', label: 'Custom links', full: true },
      yes('quickLogAdjust', 'Let teachers adjust their log-in/out time'),
      yes('showParentContacts', 'Show parent contact details'),
      { type: 'checks', name: 'studentPersonal', label: 'Show student personal details', full: true, default: [], options: asOpts(['DOB', 'Email', 'Mobile', 'Address', 'Siblings']) },
      yes('showCustomFields', 'Show custom fields'),
      { type: 'checks', name: 'hiddenSections', label: 'Hide sections', full: true, default: [], options: asOpts(TEACHER_SECTIONS) }
    ]
  },
  {
    key: 'preferences', title: 'Preferences', group: 'General', description: 'Display preferences for the admin area.',
    fields: [
      yes('logoInSideMenu', 'Show the school logo in the side menu', true),
      yes('html5DatePicker', 'Use the built-in date picker', true),
      yes('teacherLogsOnDashboard', 'Show teacher logs on the dashboard', true),
      { type: 'int', name: 'studentsPerPage', label: 'Students per list page', default: 50, min: 10, max: 500 },
      { type: 'int', name: 'photoTimeout', label: 'Photo timeout (seconds)', default: 30, min: 0, max: 3600, help: 'How long a student photo stays on screen before it is hidden again.' },
      yes('photosInSearch', 'Show photos in search results'),
      { type: 'checks', name: 'stickyNoteColours', label: 'Sticky note colours', default: ['lav', 'sky', 'violet'], options: PALETTE_COLOURS },
      yes('emailOnPortalMessages', 'Email me when a portal message arrives', true)
    ]
  }
];

export const tabByKey = (key: string) => TABS.find((t) => t.key === key);

const optional = <T extends z.ZodType>(s: T) => z.union([z.literal(''), s]).default('');
const httpUrl = z.url({ protocol: /^https?$/, error: 'Enter a full web address starting with https://' }).max(500);

export const linkSchema = z.object({
  label: z.string().trim().min(1, 'Add a label').max(60),
  url: httpUrl,
  icon: z.enum(LINK_ICONS.map((o) => o.value) as [string, ...string[]])
});

export const SecretValue = z.object({ enc: z.string() });

function fieldSchema(f: Field): z.ZodType {
  switch (f.type) {
    case 'text': case 'textarea': {
      let s = z.string().trim().max(f.max ?? 500);
      if (f.pattern) s = s.regex(f.pattern, f.patternMessage);
      const base = f.pattern ? optional(s) : s.default(f.default ?? '');
      return f.name === 'bankReference' ? base.refine(validReferenceTemplate, 'Uses an unknown variable.') : base;
    }
    case 'email': return optional(z.email('Enter a valid email address'));
    case 'url': return optional(httpUrl);
    case 'int': return z.number().int().min(f.min).max(f.max).default(f.default);
    case 'money': return z.number().int().min(0).max(100_000_00).default(f.default);
    case 'toggle': return z.boolean().default(f.default);
    case 'select': return z.enum(f.options.map((o) => o.value) as [string, ...string[]]).default(f.default);
    case 'checks': return z.array(z.enum(f.options.map((o) => o.value) as [string, ...string[]])).default(f.default);
    case 'extensions': return z.array(z.string().regex(/^[a-z0-9]{1,10}$/)).max(100).default(f.default);
    case 'links': return z.array(linkSchema).max(20).default([]);
    case 'secret': return SecretValue.nullable().default(null);
    case 'file': return z.uuid().nullable().default(null);
  }
}

export function tabSchema(tab: Tab) {
  return z.object(Object.fromEntries(tab.fields.map((f) => [f.name, fieldSchema(f)])));
}

export function validReferenceTemplate(t: string) {
  const vars = [...t.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
  return vars.every((v) => (REFERENCE_VARIABLES as readonly string[]).includes(v ?? ''));
}

/** Turns submitted form data into the typed shape the tab schema expects. Secret and file fields are handled by the caller. */
export function formToValues(tab: Tab, fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of tab.fields) {
    const raw = fd.get(f.name);
    const str = typeof raw === 'string' ? raw : '';
    switch (f.type) {
      case 'toggle': out[f.name] = fd.get(f.name) === 'on'; break;
      case 'int': out[f.name] = str.trim() === '' ? f.default : Number(str); break;
      case 'select': if (raw !== null) out[f.name] = str; break;
      case 'money': out[f.name] = str.trim() === '' ? f.default : parsePounds(str) ?? Number.NaN; break;
      case 'checks': out[f.name] = fd.getAll(f.name).filter((v): v is string => typeof v === 'string'); break;
      case 'extensions': out[f.name] = [...new Set(str.split(/[\s,;]+/).map((x) => x.trim().toLowerCase().replace(/^\./, '')).filter(Boolean))]; break;
      case 'links': {
        const labels = fd.getAll(`${f.name}.label`), urls = fd.getAll(`${f.name}.url`), icons = fd.getAll(`${f.name}.icon`);
        out[f.name] = labels.map((l, i) => ({ label: String(l), url: String(urls[i] ?? ''), icon: String(icons[i] ?? 'link') }))
          .filter((l) => l.label.trim() || l.url.trim());
        break;
      }
      case 'secret': case 'file': break;
      default: if (raw !== null) out[f.name] = str; // absent → schema default
    }
  }
  return out;
}
