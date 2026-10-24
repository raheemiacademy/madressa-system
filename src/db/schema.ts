import { sql } from 'drizzle-orm';
import {
  bigserial, boolean, check, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, smallint, text, time, timestamp, uniqueIndex, uuid
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => tz('created_at').notNull().defaultNow();

export const portalEnum = pgEnum('portal', ['admin', 'teacher', 'parent', 'student']);

// §3 School Profile — single row (id = 1).
export const schoolProfile = pgTable('school_profile', {
  id: integer('id').primaryKey().default(1),
  name: text('name').notNull(),
  logoFileId: uuid('logo_file_id'),
  logoUrl: text('logo_url'),
  address: text('address'),
  city: text('city'),
  postcode: text('postcode'),
  email: text('email'),
  noReplyEmail: text('no_reply_email'),
  bccEmail: text('bcc_email'),
  receiptSenderEmail: text('receipt_sender_email'),
  receiptSenderName: text('receipt_sender_name'),
  tel: text('tel'),
  fax: text('fax'),
  updatedAt: tz('updated_at').notNull().defaultNow()
}, (t) => [check('school_profile_singleton', sql`${t.id} = 1`)]);

// §4 Settings — one row per tab, value validated by the tab's Zod schema.
export const setting = pgTable('setting', {
  tab: text('tab').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: tz('updated_at').notNull().defaultNow(),
  updatedBy: integer('updated_by')
});

// §3 Academic Year
export const academicYear = pgTable('academic_year', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  endsOn: date('ends_on', { mode: 'string' }).notNull(),
  isCurrent: boolean('is_current').notNull().default(false),
  createdAt: createdAt()
}, (t) => [
  check('academic_year_dates', sql`${t.endsOn} > ${t.startsOn}`),
  uniqueIndex('academic_year_title_uq').on(sql`lower(${t.title})`),
  uniqueIndex('academic_year_one_current').on(t.isCurrent).where(sql`${t.isCurrent}`)
]);

// §3 Admin Staff
export const adminStaff = pgTable('admin_staff', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  mobile: text('mobile'),
  rank: text('rank'),
  role: text('role'),
  dbsNumber: text('dbs_number'),
  dbsIssuedOn: date('dbs_issued_on', { mode: 'string' }),
  dbsExpiresOn: date('dbs_expires_on', { mode: 'string' }),
  isSuper: boolean('is_super').notNull().default(false),
  canEdit: boolean('can_edit').notNull().default(false),
  canDelete: boolean('can_delete').notNull().default(false),
  feesAccess: boolean('fees_access').notNull().default(false),
  marketing: boolean('marketing').notNull().default(false),
  sendSms: boolean('send_sms').notNull().default(false),
  createdAt: createdAt(),
  deletedAt: tz('deleted_at')
}, (t) => [uniqueIndex('admin_staff_email_uq').on(sql`lower(${t.email})`).where(sql`${t.deletedAt} is null`)]);

// One login per (portal, email). The same person may hold logins on several portals.
export const loginIdentity = pgTable('login_identity', {
  id: serial('id').primaryKey(),
  portal: portalEnum('portal').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  allowLogin: boolean('allow_login').notNull().default(true),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: tz('locked_until'),
  lastLoginAt: tz('last_login_at'),
  adminStaffId: integer('admin_staff_id').references(() => adminStaff.id, { onDelete: 'cascade' }),
  // Explicit types break the loginIdentity ↔ fileObject ↔ person reference cycle for TypeScript.
  teacherId: integer('teacher_id').references((): AnyPgColumn => teacher.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references((): AnyPgColumn => contact.id, { onDelete: 'cascade' }),
  studentId: integer('student_id').references((): AnyPgColumn => student.id, { onDelete: 'cascade' }),
  createdAt: createdAt()
}, (t) => [
  uniqueIndex('login_identity_portal_email_uq').on(t.portal, sql`lower(${t.email})`),
  uniqueIndex('login_identity_admin_staff_uq').on(t.adminStaffId),
  uniqueIndex('login_identity_teacher_uq').on(t.teacherId),
  uniqueIndex('login_identity_contact_uq').on(t.contactId),
  uniqueIndex('login_identity_student_uq').on(t.studentId),
  // Each login belongs to exactly the person type of its portal.
  check('login_identity_admin_link', sql`(${t.portal} = 'admin') = (${t.adminStaffId} is not null)
    and (${t.portal} = 'teacher') = (${t.teacherId} is not null)
    and (${t.portal} = 'parent') = (${t.contactId} is not null)
    and (${t.portal} = 'student') = (${t.studentId} is not null)`)
]);

export const session = pgTable('session', {
  id: text('id').primaryKey(), // sha256(token), hex — the raw token only ever lives in the cookie
  identityId: integer('identity_id').notNull().references(() => loginIdentity.id, { onDelete: 'cascade' }),
  portal: portalEnum('portal').notNull(),
  createdAt: createdAt(),
  expiresAt: tz('expires_at').notNull(),
  lastSeenAt: tz('last_seen_at').notNull().defaultNow(),
  ip: text('ip'),
  userAgent: text('user_agent')
}, (t) => [index('session_identity_idx').on(t.identityId)]);

export const rateLimit = pgTable('rate_limit', {
  key: text('key').primaryKey(),
  hits: integer('hits').notNull(),
  windowStartedAt: tz('window_started_at').notNull()
});

// §3 Audits
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: tz('at').notNull().defaultNow(),
  actorIdentityId: integer('actor_identity_id').references(() => loginIdentity.id, { onDelete: 'set null' }),
  actorName: text('actor_name').notNull(),
  action: text('action').notNull(),
  page: text('page').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  details: jsonb('details')
}, (t) => [index('audit_log_at_idx').on(t.at)]);

// §3 Calendar/Holidays (class targeting is added with classes in Phase 2)
export const holiday = pgTable('holiday', {
  id: serial('id').primaryKey(),
  academicYearId: integer('academic_year_id').notNull().references(() => academicYear.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  description: text('description'),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  endsOn: date('ends_on', { mode: 'string' }).notNull(),
  showTeacher: boolean('show_teacher').notNull().default(true),
  showParent: boolean('show_parent').notNull().default(true),
  showStudent: boolean('show_student').notNull().default(true),
  studentsAttend: boolean('students_attend').notNull().default(false),
  teachersAttend: boolean('teachers_attend').notNull().default(false),
  allClasses: boolean('all_classes').notNull().default(true),
  createdAt: createdAt()
}, (t) => [check('holiday_dates', sql`${t.endsOn} >= ${t.startsOn}`)]);

// §1/§19 Sticky notes
export const stickyNote = pgTable('sticky_note', {
  id: serial('id').primaryKey(),
  pagePath: text('page_path').notNull(),
  body: text('body').notNull(),
  colour: text('colour').notNull(),
  createdBy: integer('created_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: tz('updated_at').notNull().defaultNow()
}, (t) => [index('sticky_note_page_idx').on(t.pagePath)]);

export const fileObject = pgTable('file_object', {
  id: uuid('id').primaryKey().defaultRandom(),
  storageKey: text('storage_key').notNull().unique(),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  purpose: text('purpose').notNull(),
  createdBy: integer('created_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt()
});

/* ───────────── Phase 2: people and classes (§4 year groups and custom fields, §5) ───────────── */

export const GENDERS = ['Male', 'Female', 'Unspecified'] as const;
export const STUDENT_STATUSES = ['Waiting List', 'Current', 'Relocated/Left', 'Suspended', 'Expelled', 'Finished', 'On Hold', 'Accepted', 'Deceased', 'Rejected'] as const;
export const CONTACT_TYPES = ['Parent', 'Sibling', 'Emergency', 'Other'] as const;
export const TEACHER_STATUSES = ['Inactive', 'Employed', 'Suspended', 'Dismissed', 'Resigned', 'Retired', 'Volunteer'] as const;
export const CUSTOM_FIELD_TYPES = ['text', 'multiline', 'number', 'decimal', 'date', 'time', 'radio', 'checkboxes'] as const;
export const CUSTOM_FIELD_ENTITIES = ['student', 'teacher', 'staff', 'contact'] as const;

export const genderEnum = pgEnum('gender', GENDERS);
export const studentStatusEnum = pgEnum('student_status', STUDENT_STATUSES);
export const contactTypeEnum = pgEnum('contact_type', CONTACT_TYPES);
export const teacherStatusEnum = pgEnum('teacher_status', TEACHER_STATUSES);
export const customFieldTypeEnum = pgEnum('custom_field_type', CUSTOM_FIELD_TYPES);
export const customFieldEntityEnum = pgEnum('custom_field_entity', CUSTOM_FIELD_ENTITIES);

// §4 Year & Age Groups
export const yearGroup = pgTable('year_group', {
  id: serial('id').primaryKey(),
  label: text('label').notNull(),
  minAge: smallint('min_age').notNull(),
  maxAge: smallint('max_age').notNull(),
  sortOrder: integer('sort_order').notNull().default(0)
}, (t) => [check('year_group_ages', sql`${t.maxAge} >= ${t.minAge} and ${t.minAge} >= 0`), uniqueIndex('year_group_label_uq').on(sql`lower(${t.label})`)]);

// §4 Custom Fields
export const customField = pgTable('custom_field', {
  id: serial('id').primaryKey(),
  entity: customFieldEntityEnum('entity').notNull(),
  label: text('label').notNull(),
  question: text('question'),
  type: customFieldTypeEnum('type').notNull(),
  maxLength: integer('max_length'),
  decimals: smallint('decimals'),
  options: text('options').array().notNull().default(sql`'{}'::text[]`),
  searchable: boolean('searchable').notNull().default(false),
  onRegistration: boolean('on_registration').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt()
});
export const customFieldValue = pgTable('custom_field_value', {
  fieldId: integer('field_id').notNull().references(() => customField.id, { onDelete: 'cascade' }),
  ownerId: integer('owner_id').notNull(), // student, teacher, admin_staff or contact id, per the field entity
  value: jsonb('value').notNull()
}, (t) => [primaryKey({ columns: [t.fieldId, t.ownerId] })]);

// §5 Students
export const student = pgTable('student', {
  id: serial('id').primaryKey(),
  firstName: text('first_name').notNull(),
  surname: text('surname').notNull(),
  dob: date('dob', { mode: 'string' }),
  gender: genderEnum('gender').notNull().default('Unspecified'),
  email: text('email'),
  tel: text('tel'),
  mobile: text('mobile'),
  mobile2: text('mobile2'),
  address: text('address'),
  postcode: text('postcode'),
  status: studentStatusEnum('status').notNull().default('Waiting List'),
  startDate: date('start_date', { mode: 'string' }),
  leftDate: date('left_date', { mode: 'string' }),
  medicalNotesEnc: text('medical_notes_enc'), // AES-GCM; special-category data
  hasMedical: boolean('has_medical').notNull().default(false),
  notes: text('notes'),
  photoFileId: uuid('photo_file_id').references((): AnyPgColumn => fileObject.id, { onDelete: 'set null' }),
  isAdult: boolean('is_adult').notNull().default(false),
  source: text('source').notNull().default('admin'), // admin | form | adult-form | import
  createdAt: createdAt(),
  updatedAt: tz('updated_at').notNull().defaultNow()
}, (t) => [
  index('student_status_idx').on(t.status),
  index('student_name_trgm').using('gin', sql`(lower(${t.firstName} || ' ' || ${t.surname})) gin_trgm_ops`)
]);

export const studentNote = pgTable('student_note', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdBy: integer('created_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: tz('updated_at').notNull().defaultNow()
});

export const studentFile = pgTable('student_file', {
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  fileId: uuid('file_id').notNull().references(() => fileObject.id, { onDelete: 'cascade' })
}, (t) => [primaryKey({ columns: [t.studentId, t.fileId] })]);

// §5 Contacts
export const contact = pgTable('contact', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  tel: text('tel'),
  mobile: text('mobile'),
  altMobile: text('alt_mobile'),
  address: text('address'),
  postcode: text('postcode'),
  gender: genderEnum('gender'), // needed for the §4 same-gender messaging route
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: tz('updated_at').notNull().defaultNow()
}, (t) => [index('contact_name_trgm').using('gin', sql`lower(${t.name}) gin_trgm_ops`)]);

export const contactGroup = pgTable('contact_group', {
  id: serial('id').primaryKey(),
  name: text('name').notNull()
}, (t) => [uniqueIndex('contact_group_name_uq').on(sql`lower(${t.name})`)]);
export const contactGroupMember = pgTable('contact_group_member', {
  contactId: integer('contact_id').notNull().references(() => contact.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').notNull().references(() => contactGroup.id, { onDelete: 'cascade' })
}, (t) => [primaryKey({ columns: [t.contactId, t.groupId] })]);

export const studentContact = pgTable('student_contact', {
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').notNull().references(() => contact.id, { onDelete: 'cascade' }),
  type: contactTypeEnum('type').notNull().default('Parent'),
  relation: text('relation'),
  isPrimary: boolean('is_primary').notNull().default(false),
  portalAccess: boolean('portal_access').notNull().default(true), // can see this child on the parent portal
  sortOrder: integer('sort_order').notNull().default(0)
}, (t) => [primaryKey({ columns: [t.studentId, t.contactId] }), index('student_contact_contact_idx').on(t.contactId)]);

export const siblingLink = pgTable('sibling_link', {
  studentA: integer('student_a').notNull().references(() => student.id, { onDelete: 'cascade' }),
  studentB: integer('student_b').notNull().references(() => student.id, { onDelete: 'cascade' }),
  source: text('source').notNull().default('manual'),
  createdAt: createdAt()
}, (t) => [primaryKey({ columns: [t.studentA, t.studentB] }), check('sibling_order', sql`${t.studentA} < ${t.studentB}`)]);

export const walkHomeConsent = pgTable('walk_home_consent', {
  studentId: integer('student_id').primaryKey().references(() => student.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contact.id, { onDelete: 'set null' }),
  givenAt: tz('given_at').notNull().defaultNow(),
  source: text('source').notNull(), // portal | manual
  notes: text('notes'),
  recordedBy: integer('recorded_by').references(() => loginIdentity.id, { onDelete: 'set null' })
});

// §5 Teachers
export const teacher = pgTable('teacher', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  dob: date('dob', { mode: 'string' }),
  gender: genderEnum('gender').notNull().default('Unspecified'),
  email: text('email'),
  tel: text('tel'),
  mobile: text('mobile'),
  status: teacherStatusEnum('status').notNull().default('Employed'),
  startDate: date('start_date', { mode: 'string' }),
  leftDate: date('left_date', { mode: 'string' }),
  photoFileId: uuid('photo_file_id').references((): AnyPgColumn => fileObject.id, { onDelete: 'set null' }),
  address: text('address'),
  postcode: text('postcode'),
  niNumberEnc: text('ni_number_enc'),
  dbsNumber: text('dbs_number'),
  dbsIssuedOn: date('dbs_issued_on', { mode: 'string' }),
  dbsExpiresOn: date('dbs_expires_on', { mode: 'string' }),
  medicalEnc: text('medical_enc'),
  bankNameEnc: text('bank_name_enc'),
  bankAccountEnc: text('bank_account_enc'),
  bankSortCodeEnc: text('bank_sort_code_enc'),
  kioskPinHash: text('kiosk_pin_hash'),
  createdAt: createdAt(),
  deletedAt: tz('deleted_at')
}, (t) => [index('teacher_name_trgm').using('gin', sql`lower(${t.name}) gin_trgm_ops`)]);

export const teacherEmergencyContact = pgTable('teacher_emergency_contact', {
  id: serial('id').primaryKey(),
  teacherId: integer('teacher_id').notNull().references(() => teacher.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  relation: text('relation'),
  phone: text('phone')
});

export const teacherHours = pgTable('teacher_hours', {
  teacherId: integer('teacher_id').notNull().references(() => teacher.id, { onDelete: 'cascade' }),
  weekday: smallint('weekday').notNull(), // ISO: 1 = Monday ... 7 = Sunday
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull()
}, (t) => [primaryKey({ columns: [t.teacherId, t.weekday] }), check('teacher_hours_day', sql`${t.weekday} between 1 and 7`), check('teacher_hours_order', sql`${t.endTime} > ${t.startTime}`)]);

// §5 Classes
export const classroom = pgTable('classroom', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  location: text('location')
});

export const subject = pgTable('subject', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description')
}, (t) => [uniqueIndex('subject_name_uq').on(sql`lower(${t.name})`)]);

export const schoolClass = pgTable('school_class', {
  id: serial('id').primaryKey(),
  academicYearId: integer('academic_year_id').notNull().references(() => academicYear.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  yearGroupId: integer('year_group_id').references(() => yearGroup.id, { onDelete: 'set null' }),
  mainTeacherId: integer('main_teacher_id').references(() => teacher.id, { onDelete: 'set null' }),
  capacity: integer('capacity'),
  startsOn: date('starts_on', { mode: 'string' }),
  endsOn: date('ends_on', { mode: 'string' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt()
}, (t) => [uniqueIndex('school_class_year_name_uq').on(t.academicYearId, sql`lower(${t.name})`), check('school_class_capacity', sql`${t.capacity} is null or ${t.capacity} >= 0`)]);

export const classTeacher = pgTable('class_teacher', {
  classId: integer('class_id').notNull().references(() => schoolClass.id, { onDelete: 'cascade' }),
  teacherId: integer('teacher_id').notNull().references(() => teacher.id, { onDelete: 'cascade' }),
  canRegister: boolean('can_register').notNull().default(true),
  canEoty: boolean('can_eoty').notNull().default(false),
  canMessage: boolean('can_message').notNull().default(false),
  canMerits: boolean('can_merits').notNull().default(false),
  canHomework: boolean('can_homework').notNull().default(false),
  canIncidents: boolean('can_incidents').notNull().default(false)
}, (t) => [primaryKey({ columns: [t.classId, t.teacherId] })]);

// Class membership history; an open row (to_date null) means the student is in that class now.
export const classAssignment = pgTable('class_assignment', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  classId: integer('class_id').notNull().references(() => schoolClass.id, { onDelete: 'cascade' }),
  fromDate: date('from_date', { mode: 'string' }).notNull(),
  toDate: date('to_date', { mode: 'string' }),
  createdAt: createdAt()
}, (t) => [
  index('class_assignment_student_idx').on(t.studentId),
  index('class_assignment_class_idx').on(t.classId),
  uniqueIndex('class_assignment_one_open').on(t.studentId, t.classId).where(sql`${t.toDate} is null`),
  check('class_assignment_dates', sql`${t.toDate} is null or ${t.toDate} >= ${t.fromDate}`)
]);

export const timetableTemplate = pgTable('timetable_template', {
  id: serial('id').primaryKey(),
  name: text('name').notNull()
});

export const timetableSlot = pgTable('timetable_slot', {
  id: serial('id').primaryKey(),
  classId: integer('class_id').references(() => schoolClass.id, { onDelete: 'cascade' }),
  templateId: integer('template_id').references(() => timetableTemplate.id, { onDelete: 'cascade' }),
  weekday: smallint('weekday').notNull(),
  startTime: time('start_time').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  teacherId: integer('teacher_id').references(() => teacher.id, { onDelete: 'set null' }),
  classroomId: integer('classroom_id').references(() => classroom.id, { onDelete: 'set null' }),
  subjectId: integer('subject_id').references(() => subject.id, { onDelete: 'set null' }),
  takesRegister: boolean('takes_register').notNull().default(true)
}, (t) => [
  check('timetable_slot_owner', sql`(${t.classId} is null) <> (${t.templateId} is null)`),
  check('timetable_slot_day', sql`${t.weekday} between 1 and 7`),
  check('timetable_slot_duration', sql`${t.durationMinutes} between 1 and 1440`)
]);

export const holidayClass = pgTable('holiday_class', {
  holidayId: integer('holiday_id').notNull().references(() => holiday.id, { onDelete: 'cascade' }),
  classId: integer('class_id').notNull().references(() => schoolClass.id, { onDelete: 'cascade' })
}, (t) => [primaryKey({ columns: [t.holidayId, t.classId] })]);

// §5 Registration pages: application groups chosen on the public form
export const applicationGroup = pgTable('application_group', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  enabled: boolean('enabled').notNull().default(true),
  description: text('description'),
  required: boolean('required').notNull().default(false),
  multipleChoice: boolean('multiple_choice').notNull().default(false)
});
export const studentApplicationGroup = pgTable('student_application_group', {
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').notNull().references(() => applicationGroup.id, { onDelete: 'cascade' })
}, (t) => [primaryKey({ columns: [t.studentId, t.groupId] })]);

/* ───────────── Phase 3: attendance (§6), teacher logs (§7), fire drill (§19) ───────────── */

export const MARKS = ['present', 'late', 'absent', 'left_early', 'not_counted'] as const;
export const CODE_TYPES = ['present', 'approved', 'authorised', 'unauthorised', 'not_counted'] as const;
export const markEnum = pgEnum('attendance_mark_kind', MARKS);
export const codeTypeEnum = pgEnum('attendance_code_type', CODE_TYPES);

// §4 Register: DfE attendance codes (used when the register type is "dfe").
export const attendanceCode = pgTable('attendance_code', {
  code: text('code').primaryKey(),
  description: text('description').notNull(),
  type: codeTypeEnum('type').notNull(),
  keys: text('keys'),
  isLate: boolean('is_late').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true)
});

// One register per class, date and start time.
export const registerSession = pgTable('register_session', {
  id: serial('id').primaryKey(),
  classId: integer('class_id').notNull().references(() => schoolClass.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  startTime: time('start_time').notNull(),
  slotId: integer('slot_id').references(() => timetableSlot.id, { onDelete: 'set null' }),
  takenBy: integer('taken_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  takenAt: tz('taken_at'),
  createdAt: createdAt()
}, (t) => [uniqueIndex('register_session_uq').on(t.classId, t.date, t.startTime), index('register_session_date_idx').on(t.date)]);

export const attendanceMark = pgTable('attendance_mark', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull().references(() => registerSession.id, { onDelete: 'cascade' }),
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  mark: markEnum('mark').notNull(),
  code: text('code').references(() => attendanceCode.code, { onDelete: 'set null' }), // DfE mode only
  authorised: boolean('authorised'), // null = authorisation unspecified
  notified: boolean('notified').notNull().default(false),
  lateMinutes: integer('late_minutes'),
  leftEarlyMinutes: integer('left_early_minutes'),
  note: text('note'),
  updatedBy: integer('updated_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  updatedAt: tz('updated_at').notNull().defaultNow()
}, (t) => [
  uniqueIndex('attendance_mark_uq').on(t.sessionId, t.studentId),
  index('attendance_mark_student_idx').on(t.studentId),
  check('attendance_mark_minutes', sql`coalesce(${t.lateMinutes}, 0) between 0 and 600 and coalesce(${t.leftEarlyMinutes}, 0) between 0 and 600`)
]);

// "Will be absent / late today" notices from parents (portal), shown on registers and the dashboard.
export const absenceNotice = pgTable('absence_notice', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contact.id, { onDelete: 'set null' }),
  date: date('date', { mode: 'string' }).notNull(),
  kind: text('kind').notNull(), // absent | late
  expectedArrival: time('expected_arrival'),
  reason: text('reason'),
  createdAt: createdAt(),
  seenAt: tz('seen_at'),
  seenBy: integer('seen_by').references(() => loginIdentity.id, { onDelete: 'set null' })
}, (t) => [index('absence_notice_date_idx').on(t.date), check('absence_notice_kind', sql`${t.kind} in ('absent', 'late')`)]);

export const HOLIDAY_REQUEST_STATUSES = ['Pending', 'Accepted', 'Declined', 'Info requested'] as const;
export const holidayRequestStatusEnum = pgEnum('holiday_request_status', HOLIDAY_REQUEST_STATUSES);

export const holidayRequest = pgTable('holiday_request', {
  id: serial('id').primaryKey(),
  contactId: integer('contact_id').references(() => contact.id, { onDelete: 'set null' }),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  endsOn: date('ends_on', { mode: 'string' }).notNull(),
  request: text('request').notNull(),
  response: text('response'),
  status: holidayRequestStatusEnum('status').notNull().default('Pending'),
  acceptedAs: text('accepted_as'), // authorised | unauthorised
  createdAt: createdAt(),
  respondedAt: tz('responded_at'),
  respondedBy: integer('responded_by').references(() => loginIdentity.id, { onDelete: 'set null' })
}, (t) => [check('holiday_request_dates', sql`${t.endsOn} >= ${t.startsOn}`)]);
export const holidayRequestStudent = pgTable('holiday_request_student', {
  requestId: integer('request_id').notNull().references(() => holidayRequest.id, { onDelete: 'cascade' }),
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' })
}, (t) => [primaryKey({ columns: [t.requestId, t.studentId] })]);

// §7 Teacher logs (staff attendance). One row per teacher per day.
export const teacherLog = pgTable('teacher_log', {
  id: serial('id').primaryKey(),
  teacherId: integer('teacher_id').notNull().references(() => teacher.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  timeIn: time('time_in'),
  timeOut: time('time_out'),
  absent: boolean('absent').notNull().default(false),
  source: text('source').notNull(), // admin | import | portal | kiosk
  note: text('note'),
  loggedAt: tz('logged_at').notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => loginIdentity.id, { onDelete: 'set null' })
}, (t) => [uniqueIndex('teacher_log_uq').on(t.teacherId, t.date), check('teacher_log_times', sql`${t.timeOut} is null or ${t.timeIn} is null or ${t.timeOut} >= ${t.timeIn}`)]);

// Devices an admin has set up as a sign-in kiosk (§7: kiosk PIN). Token stored hashed.
export const kioskDevice = pgTable('kiosk_device', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: integer('created_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  revokedAt: tz('revoked_at')
});

// §19 Fire drill: who started it, and the roll call saved when it ended.
export const fireDrill = pgTable('fire_drill', {
  id: serial('id').primaryKey(),
  startedAt: tz('started_at').notNull().defaultNow(),
  startedBy: integer('started_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  startedByName: text('started_by_name').notNull(),
  endedAt: tz('ended_at'),
  safeClassIds: integer('safe_class_ids').array().notNull().default(sql`'{}'::int[]`),
  report: jsonb('report')
}, (t) => [uniqueIndex('fire_drill_one_running').on(sql`(true)`).where(sql`${t.endedAt} is null`)]);

/* ───────────── Phase 4: fees (§2) and payment gateways (§4) ───────────── */

export const INVOICE_TYPES = ['Fees', 'Admission Fees', 'Contribution', 'Donation', 'Products'] as const;
export const PAYMENT_STATUSES = ['Pending', 'Cleared', 'Bounced', 'Failed', 'Reversed', 'Processing'] as const;
export const PAYMENT_METHODS = ['Cash', 'Card', 'Cheque', 'Bank Transfer', 'Direct Debit', 'Online', 'Other'] as const;
export const RECEIPT_STATES = ['unsent', 'sent', 'manual', 'no_email'] as const;
export const INTERVAL_UNITS = ['days', 'weeks', 'months'] as const;
export const DUE_RULES = ['start', 'end', '2', '3', '5', '7', '14', '21'] as const;
export const invoiceTypeEnum = pgEnum('invoice_type', INVOICE_TYPES);
export const paymentStatusEnum = pgEnum('payment_status', PAYMENT_STATUSES);
export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);
export const receiptStateEnum = pgEnum('receipt_state', RECEIPT_STATES);
export const intervalUnitEnum = pgEnum('interval_unit', INTERVAL_UNITS);

// One structure per class per year, plus one default per year; ad hoc structures are applied to single students.
export const feeStructure = pgTable('fee_structure', {
  id: serial('id').primaryKey(),
  academicYearId: integer('academic_year_id').notNull().references(() => academicYear.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  isAdHoc: boolean('is_ad_hoc').notNull().default(false),
  createdAt: createdAt()
}, (t) => [uniqueIndex('fee_structure_one_default').on(t.academicYearId).where(sql`${t.isDefault}`), check('fee_structure_kind', sql`not (${t.isDefault} and ${t.isAdHoc})`)]);

export const feeStructureClass = pgTable('fee_structure_class', {
  classId: integer('class_id').primaryKey().references(() => schoolClass.id, { onDelete: 'cascade' }),
  structureId: integer('structure_id').notNull().references(() => feeStructure.id, { onDelete: 'cascade' })
});

// A fee period issues `invoiceCount` invoices, one every `intervalCount intervalUnit` from `startsOn`, each for `amountPence`.
export const feePeriod = pgTable('fee_period', {
  id: serial('id').primaryKey(),
  structureId: integer('structure_id').notNull().references(() => feeStructure.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  endsOn: date('ends_on', { mode: 'string' }).notNull(),
  invoiceCount: smallint('invoice_count').notNull().default(1),
  intervalCount: smallint('interval_count').notNull().default(1),
  intervalUnit: intervalUnitEnum('interval_unit').notNull().default('months'),
  amountPence: integer('amount_pence').notNull(),
  startWeekday: smallint('start_weekday'), // null = the day it is issued; 0 = the first Sunday on or after, … 6 = Saturday
  dueRule: text('due_rule').notNull().default('start'),
  sortOrder: integer('sort_order').notNull().default(0)
}, (t) => [
  check('fee_period_dates', sql`${t.endsOn} >= ${t.startsOn}`),
  check('fee_period_counts', sql`${t.invoiceCount} between 1 and 60 and ${t.intervalCount} between 1 and 366`),
  check('fee_period_amount', sql`${t.amountPence} >= 0`),
  check('fee_period_weekday', sql`${t.startWeekday} is null or ${t.startWeekday} between 0 and 6`),
  check('fee_period_due', sql`${t.dueRule} in ('start', 'end', '2', '3', '5', '7', '14', '21')`)
]);

// One-off charges (§2 Contributions); each creates Contribution invoices.
export const contribution = pgTable('contribution', {
  id: serial('id').primaryKey(),
  academicYearId: integer('academic_year_id').notNull().references(() => academicYear.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  amountPence: integer('amount_pence').notNull(),
  invoiceDate: date('invoice_date', { mode: 'string' }).notNull(),
  dueDate: date('due_date', { mode: 'string' }).notNull(),
  audience: text('audience').notNull(),
  createdBy: integer('created_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt()
}, (t) => [check('contribution_amount', sql`${t.amountPence} > 0`)]);

export const invoice = pgTable('invoice', {
  id: serial('id').primaryKey(),
  type: invoiceTypeEnum('type').notNull().default('Fees'),
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  academicYearId: integer('academic_year_id').notNull().references(() => academicYear.id),
  billingContactId: integer('billing_contact_id').references(() => contact.id, { onDelete: 'set null' }),
  billingName: text('billing_name'),
  billingAddress: text('billing_address'),
  billingPostcode: text('billing_postcode'),
  billingNotes: text('billing_notes'),
  invoiceDate: date('invoice_date', { mode: 'string' }).notNull(),
  periodFrom: date('period_from', { mode: 'string' }),
  periodTo: date('period_to', { mode: 'string' }),
  dueDate: date('due_date', { mode: 'string' }).notNull(),
  amountPence: integer('amount_pence').notNull(),
  description: text('description'),
  // Set on generated invoices so re-running generation never creates the same invoice twice.
  generationKey: text('generation_key').unique(),
  periodId: integer('period_id').references(() => feePeriod.id, { onDelete: 'set null' }),
  contributionId: integer('contribution_id').references(() => contribution.id, { onDelete: 'set null' }),
  createdBy: integer('created_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: tz('updated_at').notNull().defaultNow(),
  deletedAt: tz('deleted_at')
}, (t) => [
  index('invoice_student_idx').on(t.studentId),
  index('invoice_due_idx').on(t.dueDate),
  index('invoice_year_idx').on(t.academicYearId),
  check('invoice_amount', sql`${t.amountPence} >= 0`),
  check('invoice_period', sql`${t.periodTo} is null or ${t.periodFrom} is null or ${t.periodTo} >= ${t.periodFrom}`)
]);

export const payment = pgTable('payment', {
  id: serial('id').primaryKey(),
  invoiceId: integer('invoice_id').notNull().references(() => invoice.id, { onDelete: 'cascade' }),
  amountPence: integer('amount_pence').notNull(),
  receivedOn: date('received_on', { mode: 'string' }).notNull(),
  method: paymentMethodEnum('method').notNull(),
  status: paymentStatusEnum('status').notNull().default('Cleared'),
  reference: text('reference'),
  note: text('note'),
  receiptState: receiptStateEnum('receipt_state').notNull().default('unsent'),
  receiptSentAt: tz('receipt_sent_at'),
  gatewayProvider: text('gateway_provider'), // stripe | gocardless
  gatewayPaymentId: text('gateway_payment_id'),
  checkoutGroup: uuid('checkout_group'), // payments split across invoices from one transaction
  createdBy: integer('created_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: tz('updated_at').notNull().defaultNow()
}, (t) => [
  index('payment_invoice_idx').on(t.invoiceId),
  index('payment_received_idx').on(t.receivedOn),
  index('payment_gateway_idx').on(t.gatewayProvider, t.gatewayPaymentId),
  check('payment_amount', sql`${t.amountPence} > 0`)
]);

// Standing per-student adjustment applied when fees invoices are generated. amount is pence, or basis points when unit = 'percent'.
export const feeAdjustment = pgTable('fee_adjustment', {
  studentId: integer('student_id').primaryKey().references(() => student.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // deduct | add | free
  amount: integer('amount').notNull().default(0),
  unit: text('unit').notNull().default('pence'), // pence | percent
  source: text('source').notNull().default('manual'), // manual | sibling
  updatedAt: tz('updated_at').notNull().defaultNow()
}, (t) => [
  check('fee_adjustment_kind', sql`${t.kind} in ('deduct', 'add', 'free') and ${t.unit} in ('pence', 'percent') and ${t.amount} >= 0`),
  check('fee_adjustment_pct', sql`${t.unit} <> 'percent' or ${t.amount} <= 10000`)
]);

export const siblingDiscountSet = pgTable('sibling_discount_set', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: createdAt()
});
export const siblingDiscountRule = pgTable('sibling_discount_rule', {
  setId: integer('set_id').notNull().references(() => siblingDiscountSet.id, { onDelete: 'cascade' }),
  position: smallint('position').notNull(), // 2 = second child …
  kind: text('kind').notNull(), // deduct | add
  amount: integer('amount').notNull(),
  unit: text('unit').notNull() // pence | percent
}, (t) => [
  primaryKey({ columns: [t.setId, t.position] }),
  check('sibling_rule_values', sql`${t.position} between 2 and 20 and ${t.kind} in ('deduct', 'add') and ${t.unit} in ('pence', 'percent') and ${t.amount} >= 0 and (${t.unit} <> 'percent' or ${t.amount} <= 10000)`)
]);

export const directDebitMandate = pgTable('direct_debit_mandate', {
  id: serial('id').primaryKey(),
  contactId: integer('contact_id').references(() => contact.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // gocardless
  mandateId: text('mandate_id').notNull(),
  status: text('status').notNull(),
  createdAt: createdAt(),
  updatedAt: tz('updated_at').notNull().defaultNow()
}, (t) => [uniqueIndex('direct_debit_mandate_uq').on(t.provider, t.mandateId)]);

// Webhook idempotency: each provider event is processed once. Only the type is kept, not the payload.
export const gatewayEvent = pgTable('gateway_event', {
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull(),
  type: text('type').notNull(),
  receivedAt: tz('received_at').notNull().defaultNow()
}, (t) => [primaryKey({ columns: [t.provider, t.eventId] })]);
