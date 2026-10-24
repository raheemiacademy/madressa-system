import { COLUMNS, type ImportKind } from './imports';

/*
 * "Import from any layout": a madrasah's own spreadsheet rarely uses our template's headings. We guess which of their columns
 * means what (they can change any guess), then rename the columns before the usual checks and preview.
 * Headings arrive normalised by the parsers ("Date of Birth" → date_of_birth).
 */

export const FULL_NAME = '__full_name'; // one "Name" column, split into first name and surname
export const SKIP = '';

// Common headings in exports and home-made spreadsheets, after normalising. Our own template names match themselves.
const SYNONYMS: Partial<Record<ImportKind, Record<string, string[]>>> = {
  students: {
    first_name: ['first_name', 'firstname', 'forename', 'forenames', 'given_name', 'first', 'child_first_name', 'student_first_name', 'pupil_first_name', 'legal_forename'],
    surname: ['surname', 'last_name', 'lastname', 'family_name', 'second_name', 'child_surname', 'student_surname', 'pupil_surname', 'legal_surname'],
    [FULL_NAME]: ['name', 'full_name', 'student_name', 'child_name', 'pupil_name', 'student', 'child', 'pupil', 'childs_name', 'child_s_name', 'name_of_child'],
    dob: ['dob', 'd_o_b', 'date_of_birth', 'birth_date', 'birthdate', 'birthday', 'date_born'],
    gender: ['gender', 'sex', 'boy_girl'],
    status: ['status', 'student_status', 'enrolment_status'],
    class: ['class', 'class_name', 'group', 'class_group', 'form', 'year_class', 'halaqa', 'level', 'teacher_class'],
    start_date: ['start_date', 'date_joined', 'joined', 'admission_date', 'enrolment_date', 'enrolled', 'start'],
    left_date: ['left_date', 'date_left', 'leaving_date', 'end_date'],
    address: ['address', 'home_address', 'address_line_1', 'address_1', 'street', 'full_address'],
    postcode: ['postcode', 'post_code', 'postal_code', 'zip', 'zip_code'],
    medical_notes: ['medical_notes', 'medical', 'medical_conditions', 'allergies', 'health', 'medical_info', 'medical_information', 'health_notes'],
    notes: ['notes', 'comments', 'other_notes', 'remarks'],
    contact_name: ['contact_name', 'parent_name', 'parent', 'guardian', 'guardian_name', 'parent_guardian', 'parent_guardian_name', 'mother_name', 'father_name', 'parent_carer', 'parent_full_name', 'primary_contact'],
    contact_relation: ['contact_relation', 'relation', 'relationship', 'relationship_to_child'],
    contact_email: ['contact_email', 'parent_email', 'guardian_email', 'email', 'email_address', 'e_mail', 'parent_email_address', 'family_email'],
    contact_mobile: ['contact_mobile', 'parent_mobile', 'parent_phone', 'guardian_phone', 'mobile', 'mobile_number', 'phone', 'phone_number', 'telephone', 'contact_number', 'tel', 'parent_contact_number', 'emergency_contact_number', 'whatsapp', 'whatsapp_number']
  },
  contacts: {
    name: ['name', 'full_name', 'parent_name', 'contact_name', 'guardian_name'],
    email: ['email', 'email_address', 'e_mail'],
    mobile: ['mobile', 'mobile_number', 'phone', 'phone_number', 'telephone', 'contact_number', 'whatsapp'],
    postcode: ['postcode', 'post_code', 'postal_code'],
    address: ['address', 'home_address', 'address_line_1'],
    relation: ['relation', 'relationship']
  },
  teachers: {
    name: ['name', 'full_name', 'teacher', 'teacher_name', 'staff_name', 'ustadh', 'ustadha'],
    email: ['email', 'email_address', 'e_mail'],
    mobile: ['mobile', 'mobile_number', 'phone', 'phone_number', 'telephone'],
    dob: ['dob', 'date_of_birth', 'birth_date'],
    start_date: ['start_date', 'date_joined', 'joined']
  },
  classes: {
    name: ['name', 'class', 'class_name', 'group'],
    teacher: ['teacher', 'teacher_name', 'main_teacher', 'ustadh', 'ustadha'],
    year_group: ['year_group', 'age_group', 'level'],
    capacity: ['capacity', 'places', 'size', 'max_students']
  }
};

/** Everything a column can be matched to, for the "Goes into" picker. */
export function targetsFor(kind: ImportKind) {
  const cols = COLUMNS[kind].filter((c) => c.name !== 'id').map((c) => ({ value: c.name, label: c.help && c.help.length < 40 ? `${c.name.replace(/_/g, ' ')} (${c.help})` : c.name.replace(/_/g, ' ') }));
  return [{ value: SKIP, label: 'Don’t import this column' }, ...(kind === 'students' ? [{ value: FULL_NAME, label: 'full name (split into first name and surname)' }] : []), ...cols];
}

/** True when the file already uses our template's headings, so no matching step is needed. */
export const usesTemplate = (kind: ImportKind, headers: string[]) => headers.length > 0 && headers.every((h) => COLUMNS[kind].some((c) => c.name === h));

/** Best guess for each of their headings. Each of our columns is used once: the first heading that matches it wins. */
export function guessMapping(kind: ImportKind, headers: string[]) {
  const syn = SYNONYMS[kind] ?? {};
  const taken = new Set<string>();
  const out: Record<string, string> = {};
  const find = (h: string) => {
    if (COLUMNS[kind].some((c) => c.name === h) && h !== 'id') return h;
    for (const [target, names] of Object.entries(syn)) if (names.includes(h)) return target;
    // "Mother's mobile", "Father mobile number"…: look at the words inside the heading.
    if (kind === 'students') {
      const parentish = /(parent|mother|father|guardian|carer|mum|dad|contact)/.test(h);
      if (/mobile|phone|tel|whatsapp/.test(h)) return parentish || !headers.some((x) => /mobile|phone/.test(x) && x !== h) ? 'contact_mobile' : 'mobile';
      if (/email/.test(h)) return 'contact_email';
      if (parentish && /name/.test(h)) return 'contact_name';
      if (/birth/.test(h)) return 'dob';
      if (/medic|allerg/.test(h)) return 'medical_notes';
    }
    return SKIP;
  };
  for (const h of headers) {
    const t = find(h);
    out[h] = t && !taken.has(t) ? t : SKIP;
    if (out[h]) taken.add(out[h]);
  }
  // A separate first name and surname beat a single "name" column.
  if (Object.values(out).includes('first_name') && Object.values(out).includes(FULL_NAME)) for (const h of headers) if (out[h] === FULL_NAME) out[h] = SKIP;
  return out;
}

/** Renames their columns to ours (dropping skipped ones), splitting a full name at its last space. */
export function applyMapping(rows: Record<string, string>[], mapping: Record<string, string>) {
  return rows.map((r) => {
    const o: Record<string, string> = {};
    for (const [from, to] of Object.entries(mapping)) {
      const v = (r[from] ?? '').trim();
      if (!to || !v) continue;
      if (to === FULL_NAME) {
        const parts = v.split(/\s+/);
        o.surname ||= parts.length > 1 ? parts.pop()! : '';
        o.first_name ||= parts.join(' ');
      } else o[to] ||= v;
    }
    return o;
  });
}
