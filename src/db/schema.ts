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
  emailVerifiedAt: tz('email_verified_at'),
  mustChangePassword: boolean('must_change_password').notNull().default(false), // set when an admin chose the password
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

/* ───────────── Phase 5: communication (§10, §11, §19 mail queue and templates) ───────────── */

// §19 Mail Queue Manager. Attachments are HTML rendered to PDF by the worker when it sends.
export const MAIL_STATUSES = ['queued', 'sending', 'sent', 'failed'] as const;
export const mailStatusEnum = pgEnum('mail_status', MAIL_STATUSES);
export const mailQueue = pgTable('mail_queue', {
  id: serial('id').primaryKey(),
  toEmail: text('to_email').notNull(),
  toName: text('to_name'),
  fromEmail: text('from_email'),
  fromName: text('from_name'),
  replyTo: text('reply_to'),
  cc: text('cc'),
  bcc: text('bcc'),
  subject: text('subject').notNull(),
  html: text('html').notNull(),
  attachments: jsonb('attachments').$type<{ filename: string; html: string }[]>().notNull().default(sql`'[]'::jsonb`),
  status: mailStatusEnum('status').notNull().default('queued'),
  attempts: smallint('attempts').notNull().default(0),
  lastError: text('last_error'),
  sendAfter: tz('send_after').notNull().defaultNow(),
  sentAt: tz('sent_at'),
  entity: text('entity'), // what it is about, e.g. payment, so a receipt can be marked sent
  entityId: integer('entity_id'),
  createdBy: integer('created_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt()
}, (t) => [index('mail_queue_due_idx').on(t.status, t.sendAfter)]);

// §19 Templates Editor: a row overrides the built-in text for a template key; extra versions (e.g. "Urgent") sit beside it.
export const template = pgTable('template', {
  id: serial('id').primaryKey(),
  key: text('key').notNull(),
  version: text('version').notNull().default('Standard'),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  updatedAt: tz('updated_at').notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => loginIdentity.id, { onDelete: 'set null' })
}, (t) => [uniqueIndex('template_key_version_uq').on(t.key, sql`lower(${t.version})`)]);

// §11 Newsletters.
export const newsletter = pgTable('newsletter', {
  id: serial('id').primaryKey(),
  fromName: text('from_name'),
  fromEmail: text('from_email'),
  subject: text('subject').notNull(),
  audience: text('audience').notNull(), // parents | contacts | teachers | admins | students | classes
  classIds: integer('class_ids').array().notNull().default(sql`'{}'::int[]`),
  style: text('style').notNull().default('modern'),
  signature: text('signature'),
  body: text('body').notNull().default(''),
  fileIds: uuid('file_ids').array().notNull().default(sql`'{}'::uuid[]`),
  createdBy: integer('created_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: tz('updated_at').notNull().defaultNow(),
  lastSentAt: tz('last_sent_at'),
  lastSentCount: integer('last_sent_count')
});

// §10 Messages. A thread is either with the office (admins, optionally for one rank) or between a teacher and a contact.
export const PARTY_KINDS = ['admin', 'teacher', 'contact'] as const;
export const partyKindEnum = pgEnum('party_kind', PARTY_KINDS);
export const messageThread = pgTable('message_thread', {
  id: serial('id').primaryKey(),
  subject: text('subject').notNull(),
  withOffice: boolean('with_office').notNull().default(true),
  faoRank: text('fao_rank'), // null = all admins
  locked: boolean('locked').notNull().default(false),
  createdAt: createdAt(),
  lastMessageAt: tz('last_message_at').notNull().defaultNow(),
  deletedAt: tz('deleted_at')
}, (t) => [index('message_thread_last_idx').on(t.lastMessageAt)]);

export const message = pgTable('message', {
  id: serial('id').primaryKey(),
  threadId: integer('thread_id').notNull().references(() => messageThread.id, { onDelete: 'cascade' }),
  senderKind: partyKindEnum('sender_kind').notNull(),
  senderId: integer('sender_id').notNull(), // admin_staff / teacher / contact id
  senderName: text('sender_name').notNull(),
  body: text('body').notNull(),
  attachmentFileId: uuid('attachment_file_id').references(() => fileObject.id, { onDelete: 'set null' }),
  createdAt: createdAt()
}, (t) => [index('message_thread_idx').on(t.threadId)]);

// Everyone on a thread with their read state. Admins get a row each once they've opened or archived it.
export const messageParticipant = pgTable('message_participant', {
  threadId: integer('thread_id').notNull().references(() => messageThread.id, { onDelete: 'cascade' }),
  kind: partyKindEnum('kind').notNull(),
  personId: integer('person_id').notNull(),
  lastReadAt: tz('last_read_at'),
  unreadOverride: boolean('unread_override').notNull().default(false)
}, (t) => [primaryKey({ columns: [t.threadId, t.kind, t.personId] }), index('message_participant_person_idx').on(t.kind, t.personId)]);

// §11 SMS.
export const smsTemplate = pgTable('sms_template', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(),
  systemKey: text('system_key').unique(), // two_factor | absence | fees_reminder | homework | incident | late; null for custom
  name: text('name').notNull(),
  body: text('body').notNull()
});
export const SMS_STATUSES = ['queued', 'sent', 'failed'] as const;
export const smsStatusEnum = pgEnum('sms_status', SMS_STATUSES);
export const smsMessage = pgTable('sms_message', {
  id: serial('id').primaryKey(),
  toNumber: text('to_number').notNull(),
  recipientKind: text('recipient_kind').notNull(), // contact | teacher | admin | student | number
  recipientId: integer('recipient_id'),
  recipientName: text('recipient_name'),
  body: text('body').notNull(),
  status: smsStatusEnum('status').notNull().default('queued'),
  provider: text('provider'),
  providerId: text('provider_id'),
  credits: integer('credits'),
  error: text('error'),
  batchId: uuid('batch_id'),
  sentBy: integer('sent_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  sentAt: tz('sent_at')
}, (t) => [index('sms_message_created_idx').on(t.createdAt), index('sms_message_status_idx').on(t.status)]);

// Attendance alerts already emailed, so a student isn't alerted again within the look-back interval.
export const alertSent = pgTable('alert_sent', {
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // low | high
  sentOn: date('sent_on', { mode: 'string' }).notNull()
}, (t) => [primaryKey({ columns: [t.studentId, t.kind, t.sentOn] })]);

// Daily background jobs claim their day here so they run once even with several workers.
export const jobRun = pgTable('job_run', {
  key: text('key').primaryKey(),
  lastRunOn: date('last_run_on', { mode: 'string' }).notNull(),
  updatedAt: tz('updated_at').notNull().defaultNow()
});

// One-time links: verify an email and set a password (teacher invites, forgotten passwords). Stored hashed.
export const authToken = pgTable('auth_token', {
  id: serial('id').primaryKey(),
  identityId: integer('identity_id').notNull().references(() => loginIdentity.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: tz('expires_at').notNull(),
  usedAt: tz('used_at'),
  createdAt: createdAt()
});

/* ───────────── Phase 6: learning (§8 events, §9 incidents, §13 homework, §14 forums, §15 exams, §16 EOTY, §17 products, §18 merits) ───────────── */

// §13 Homework. A row per student it's set for; completedAt null = not done yet.
export const homeworkTemplate = pgTable('homework_template', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  instructions: text('instructions').notNull().default('')
});
export const homework = pgTable('homework', {
  id: serial('id').primaryKey(),
  academicYearId: integer('academic_year_id').notNull().references(() => academicYear.id, { onDelete: 'cascade' }),
  classId: integer('class_id').notNull().references(() => schoolClass.id, { onDelete: 'cascade' }),
  teacherId: integer('teacher_id').references(() => teacher.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  instructions: text('instructions').notNull().default(''),
  deadlineAt: tz('deadline_at').notNull(),
  lockAfterDeadline: boolean('lock_after_deadline').notNull().default(false),
  allowUploads: boolean('allow_uploads').notNull().default(false),
  active: boolean('active').notNull().default(true),
  locked: boolean('locked').notNull().default(false),
  fileId: uuid('file_id').references(() => fileObject.id, { onDelete: 'set null' }),
  createdBy: integer('created_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt()
}, (t) => [index('homework_class_idx').on(t.classId), index('homework_deadline_idx').on(t.deadlineAt)]);
export const homeworkStudent = pgTable('homework_student', {
  homeworkId: integer('homework_id').notNull().references(() => homework.id, { onDelete: 'cascade' }),
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  completedAt: tz('completed_at'),
  note: text('note'),
  uploadFileId: uuid('upload_file_id').references(() => fileObject.id, { onDelete: 'set null' }),
  uploadedAt: tz('uploaded_at') // handed in from the parent portal
}, (t) => [primaryKey({ columns: [t.homeworkId, t.studentId] }), index('homework_student_student_idx').on(t.studentId)]);

// §15 Grades: rows of "at least this % → grade".
export const gradeSystem = pgTable('grade_system', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  isDefault: boolean('is_default').notNull().default(false)
});
export const gradeBand = pgTable('grade_band', {
  systemId: integer('system_id').notNull().references(() => gradeSystem.id, { onDelete: 'cascade' }),
  minPct: smallint('min_pct').notNull(),
  grade: text('grade').notNull()
}, (t) => [primaryKey({ columns: [t.systemId, t.minPct] }), check('grade_band_pct', sql`${t.minPct} between 0 and 100`)]);

// §15 Exams (official exams feed EOTY reports; progressive tests don't). Tests are the subject papers.
export const EXAM_STATUSES = ['open', 'closed', 'locked'] as const;
export const exam = pgTable('exam', {
  id: serial('id').primaryKey(),
  academicYearId: integer('academic_year_id').notNull().references(() => academicYear.id, { onDelete: 'cascade' }),
  classId: integer('class_id').notNull().references(() => schoolClass.id, { onDelete: 'cascade' }),
  official: boolean('official').notNull().default(true),
  title: text('title').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  status: text('status').notNull().default('open'),
  gradeSystemId: integer('grade_system_id').references(() => gradeSystem.id, { onDelete: 'set null' }),
  addedByTeacher: boolean('added_by_teacher').notNull().default(false),
  createdBy: integer('created_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt()
}, (t) => [check('exam_status', sql`${t.status} in ('open', 'closed', 'locked')`)]);
export const examTest = pgTable('exam_test', {
  id: serial('id').primaryKey(),
  examId: integer('exam_id').notNull().references(() => exam.id, { onDelete: 'cascade' }),
  subjectId: integer('subject_id').references(() => subject.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  maxMarks: smallint('max_marks').notNull(),
  sortOrder: smallint('sort_order').notNull().default(0)
}, (t) => [check('exam_test_max', sql`${t.maxMarks} between 1 and 1000`)]);
// Marks are stored in tenths so half marks are exact (45.5 → 455).
export const examResult = pgTable('exam_result', {
  testId: integer('test_id').notNull().references(() => examTest.id, { onDelete: 'cascade' }),
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  markTenths: integer('mark_tenths'), // null with absent = didn't sit it
  absent: boolean('absent').notNull().default(false),
  updatedAt: tz('updated_at').notNull().defaultNow()
}, (t) => [primaryKey({ columns: [t.testId, t.studentId] }), check('exam_result_mark', sql`${t.markTenths} is null or ${t.markTenths} >= 0`)]);
export const semester = pgTable('semester', {
  id: serial('id').primaryKey(),
  academicYearId: integer('academic_year_id').notNull().references(() => academicYear.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  classIds: integer('class_ids').array().notNull().default(sql`'{}'::int[]`),
  examIds: integer('exam_ids').array().notNull().default(sql`'{}'::int[]`)
});
export const quiz = pgTable('quiz', {
  id: serial('id').primaryKey(),
  subjectId: integer('subject_id').references(() => subject.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  startsAt: tz('starts_at').notNull(),
  endsAt: tz('ends_at').notNull(),
  teacherId: integer('teacher_id').references(() => teacher.id, { onDelete: 'set null' }),
  classIds: integer('class_ids').array().notNull().default(sql`'{}'::int[]`),
  status: text('status').notNull().default('draft') // draft | open | closed
}, (t) => [check('quiz_times', sql`${t.endsAt} > ${t.startsAt}`), check('quiz_status', sql`${t.status} in ('draft', 'open', 'closed')`)]);

// §16 End-of-term/year reports.
export const eotyReport = pgTable('eoty_report', {
  id: serial('id').primaryKey(),
  academicYearId: integer('academic_year_id').notNull().references(() => academicYear.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  termStart: date('term_start', { mode: 'string' }).notNull(),
  termEnd: date('term_end', { mode: 'string' }).notNull(),
  semesterId: integer('semester_id').references(() => semester.id, { onDelete: 'set null' }),
  includeExams: boolean('include_exams').notNull().default(true),
  includePositions: boolean('include_positions').notNull().default(false),
  includeAttendance: boolean('include_attendance').notNull().default(true),
  includeHomework: boolean('include_homework').notNull().default(true),
  scoring: boolean('scoring').notNull().default(true),
  scoreLabels: text('score_labels').array().notNull().default(sql`'{Needs support,Developing,Good,Very good,Excellent}'::text[]`),
  questions: text('questions').array().notNull().default(sql`'{Behaviour,Progress,Effort}'::text[]`),
  active: boolean('active').notNull().default(true),
  teachersCanDownload: boolean('teachers_can_download').notNull().default(false),
  onPortal: boolean('on_portal').notNull().default(false), // parents see their child's report
  createdAt: createdAt()
}, (t) => [check('eoty_dates', sql`${t.termEnd} >= ${t.termStart}`)]);
// One per student per report: scores for each question (1–5, by position) and the teacher's comment.
export const eotyEntry = pgTable('eoty_entry', {
  reportId: integer('report_id').notNull().references(() => eotyReport.id, { onDelete: 'cascade' }),
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  scores: smallint('scores').array().notNull().default(sql`'{}'::smallint[]`),
  comment: text('comment'),
  writtenBy: text('written_by'),
  updatedAt: tz('updated_at').notNull().defaultNow()
}, (t) => [primaryKey({ columns: [t.reportId, t.studentId] })]);
// Paragraph templates (Behaviour, Progress, Effort × five levels). Built-in text in code; a row overrides it.
export const eotyParagraph = pgTable('eoty_paragraph', {
  area: text('area').notNull(),
  level: smallint('level').notNull(),
  body: text('body').notNull()
}, (t) => [primaryKey({ columns: [t.area, t.level] }), check('eoty_paragraph_level', sql`${t.level} between 1 and 5`)]);

// §9 Incidents for students, teachers or staff.
export const INCIDENT_SEVERITIES = ['Low', 'Medium', 'High', 'Serious'] as const;
export const incidentTemplate = pgTable('incident_template', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  severity: text('severity').notNull().default('Low'),
  title: text('title').notNull().default(''),
  report: text('report').notNull().default(''),
  action: text('action').notNull().default(''),
  inEoty: boolean('in_eoty').notNull().default(false),
  onPortal: boolean('on_portal').notNull().default(false)
});
export const incident = pgTable('incident', {
  id: serial('id').primaryKey(),
  kind: text('kind').notNull(), // student | teacher | staff
  studentId: integer('student_id').references(() => student.id, { onDelete: 'cascade' }),
  classId: integer('class_id').references(() => schoolClass.id, { onDelete: 'set null' }),
  teacherId: integer('teacher_id').references(() => teacher.id, { onDelete: 'cascade' }),
  staffId: integer('staff_id').references(() => adminStaff.id, { onDelete: 'cascade' }),
  severity: text('severity').notNull(),
  occurredAt: tz('occurred_at').notNull(),
  title: text('title').notNull(),
  report: text('report').notNull(),
  action: text('action'),
  inEoty: boolean('in_eoty').notNull().default(false),
  onPortal: boolean('on_portal').notNull().default(false),
  emailed: boolean('emailed').notNull().default(false),
  texted: boolean('texted').notNull().default(false),
  createdBy: integer('created_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt()
}, (t) => [
  index('incident_occurred_idx').on(t.occurredAt),
  check('incident_kind', sql`(${t.kind} = 'student' and ${t.studentId} is not null) or (${t.kind} = 'teacher' and ${t.teacherId} is not null) or (${t.kind} = 'staff' and ${t.staffId} is not null)`)
]);

// §18 Merits, achievements, certificates and teams.
export const merit = pgTable('merit', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  points: smallint('points').notNull().default(1), // negative for sanctions
  forStudents: boolean('for_students').notNull().default(true),
  forTeachers: boolean('for_teachers').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  official: boolean('official').notNull().default(false)
});
export const meritAward = pgTable('merit_award', {
  id: serial('id').primaryKey(),
  meritId: integer('merit_id').notNull().references(() => merit.id, { onDelete: 'cascade' }),
  studentId: integer('student_id').references(() => student.id, { onDelete: 'cascade' }),
  teacherId: integer('teacher_id').references(() => teacher.id, { onDelete: 'cascade' }),
  classId: integer('class_id').references(() => schoolClass.id, { onDelete: 'set null' }),
  points: smallint('points').notNull(),
  comment: text('comment'),
  awardedOn: date('awarded_on', { mode: 'string' }).notNull(),
  awardedBy: text('awarded_by').notNull(),
  createdAt: createdAt()
}, (t) => [index('merit_award_student_idx').on(t.studentId), check('merit_award_who', sql`(${t.studentId} is null) <> (${t.teacherId} is null)`)]);
export const certificateTemplate = pgTable('certificate_template', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  fileId: uuid('file_id').references(() => fileObject.id, { onDelete: 'set null' }), // uploaded background PDF
  size: text('size').notNull().default('A4'), // A4 | A5 | A6
  orientation: text('orientation').notNull().default('landscape'),
  // Where each item is printed: millimetres from the bottom-left, and font size in points.
  layout: jsonb('layout').$type<Record<'name' | 'achievement' | 'badge' | 'address' | 'date', { x: number; y: number; size: number }>>().notNull()
});
export const BADGES = ['none', 'bronze', 'silver', 'gold'] as const;
export const achievement = pgTable('achievement', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  sanction: boolean('sanction').notNull().default(false),
  meritId: integer('merit_id').references(() => merit.id, { onDelete: 'set null' }), // collect this merit … or null = total points
  target: integer('target').notNull(),
  badge: text('badge').notNull().default('none'),
  certificateTemplateId: integer('certificate_template_id').references(() => certificateTemplate.id, { onDelete: 'set null' }),
  forStudents: boolean('for_students').notNull().default(true),
  forTeachers: boolean('for_teachers').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true)
}, (t) => [check('achievement_target', sql`${t.target} > 0`)]);
export const certificate = pgTable('certificate', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').references(() => certificateTemplate.id, { onDelete: 'set null' }),
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  achievementId: integer('achievement_id').references(() => achievement.id, { onDelete: 'set null' }),
  badge: text('badge').notNull().default('none'),
  forText: text('for_text').notNull(),
  issuedOn: date('issued_on', { mode: 'string' }).notNull(),
  onPortal: boolean('on_portal').notNull().default(true),
  issuedBy: text('issued_by').notNull(),
  createdAt: createdAt()
});
export const meritTeam = pgTable('merit_team', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  colour: text('colour').notNull().default('lav'),
  classIds: integer('class_ids').array().notNull().default(sql`'{}'::int[]`),
  studentIds: integer('student_ids').array().notNull().default(sql`'{}'::int[]`)
});
export const teamCompetition = pgTable('team_competition', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  endsOn: date('ends_on', { mode: 'string' }).notNull()
}, (t) => [check('team_competition_dates', sql`${t.endsOn} >= ${t.startsOn}`)]);

// §17 Products (shop). stock null = unlimited. A sale either invoices the family (Products invoice) or spends merits.
export const product = pgTable('product', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  imageFileId: uuid('image_file_id').references(() => fileObject.id, { onDelete: 'set null' }),
  pricePence: integer('price_pence').notNull().default(0),
  originalPricePence: integer('original_price_pence'),
  meritPrice: integer('merit_price'),
  stock: integer('stock'),
  active: boolean('active').notNull().default(true)
}, (t) => [check('product_prices', sql`${t.pricePence} >= 0 and (${t.meritPrice} is null or ${t.meritPrice} > 0) and (${t.stock} is null or ${t.stock} >= 0)`)]);
export const productSale = pgTable('product_sale', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => product.id, { onDelete: 'restrict' }),
  studentId: integer('student_id').references(() => student.id, { onDelete: 'set null' }),
  contactId: integer('contact_id').references(() => contact.id, { onDelete: 'set null' }),
  classId: integer('class_id').references(() => schoolClass.id, { onDelete: 'set null' }),
  qty: integer('qty').notNull(),
  totalPence: integer('total_pence').notNull().default(0),
  meritsSpent: integer('merits_spent').notNull().default(0),
  invoiceId: integer('invoice_id').references(() => invoice.id, { onDelete: 'set null' }),
  soldOn: date('sold_on', { mode: 'string' }).notNull(),
  deliveredAt: tz('delivered_at'),
  createdBy: integer('created_by').references(() => loginIdentity.id, { onDelete: 'set null' }),
  createdAt: createdAt()
}, (t) => [check('product_sale_qty', sql`${t.qty} > 0 and ${t.totalPence} >= 0 and ${t.meritsSpent} >= 0`)]);

// §8 Events and trips. Parents opt in from the portal (Phase 8); staff can record an opt-in now.
export const event = pgTable('event', {
  id: serial('id').primaryKey(),
  academicYearId: integer('academic_year_id').notNull().references(() => academicYear.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  time: time('time'),
  durationMinutes: integer('duration_minutes').notNull().default(0),
  optInDeadline: date('opt_in_deadline', { mode: 'string' }),
  paymentDeadline: date('payment_deadline', { mode: 'string' }),
  description: text('description'),
  terms: text('terms'),
  classIds: integer('class_ids').array().notNull().default(sql`'{}'::int[]`), // empty = every class
  autoInvoice: boolean('auto_invoice').notNull().default(true),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt()
}, (t) => [check('event_duration', sql`${t.durationMinutes} >= 0`)]);
export const eventTimeslot = pgTable('event_timeslot', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => event.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  fromTime: time('from_time').notNull(),
  toTime: time('to_time').notNull()
});
export const eventConsent = pgTable('event_consent', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => event.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  required: boolean('required').notNull().default(true)
});
export const eventPrice = pgTable('event_price', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => event.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  pricePence: integer('price_pence').notNull(),
  required: boolean('required').notNull().default(true)
}, (t) => [check('event_price_amount', sql`${t.pricePence} >= 0`)]);
export const eventOptIn = pgTable('event_opt_in', {
  eventId: integer('event_id').notNull().references(() => event.id, { onDelete: 'cascade' }),
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contact.id, { onDelete: 'set null' }),
  timeslotId: integer('timeslot_id').references(() => eventTimeslot.id, { onDelete: 'set null' }),
  consentIds: integer('consent_ids').array().notNull().default(sql`'{}'::int[]`),
  priceIds: integer('price_ids').array().notNull().default(sql`'{}'::int[]`),
  totalPence: integer('total_pence').notNull().default(0),
  invoiceId: integer('invoice_id').references(() => invoice.id, { onDelete: 'set null' }),
  source: text('source').notNull().default('admin'), // admin | portal
  createdAt: createdAt()
}, (t) => [primaryKey({ columns: [t.eventId, t.studentId] })]);

// §14 Forums. Categories are visible to the chosen classes (none = everyone); posts come from the portals.
export const forumCategory = pgTable('forum_category', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  classIds: integer('class_ids').array().notNull().default(sql`'{}'::int[]`)
});
export const forumTopic = pgTable('forum_topic', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').notNull().references(() => forumCategory.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  authorKind: partyKindEnum('author_kind').notNull(),
  authorId: integer('author_id').notNull(),
  authorName: text('author_name').notNull(),
  locked: boolean('locked').notNull().default(false),
  createdAt: createdAt(),
  lastPostAt: tz('last_post_at').notNull().defaultNow()
});
export const forumPost = pgTable('forum_post', {
  id: serial('id').primaryKey(),
  topicId: integer('topic_id').notNull().references(() => forumTopic.id, { onDelete: 'cascade' }),
  authorKind: partyKindEnum('author_kind').notNull(),
  authorId: integer('author_id').notNull(),
  authorName: text('author_name').notNull(),
  body: text('body').notNull(),
  createdAt: createdAt(),
  deletedAt: tz('deleted_at'),
  deletedBy: text('deleted_by')
}, (t) => [index('forum_post_topic_idx').on(t.topicId)]);

/* ───────── Phase 8: portals ───────── */

// §20 Shared documents: "Files" in the parent portal, "Docs & Files" in the teacher portal.
export const SHARED_DOC_AUDIENCES = ['parents', 'teachers', 'both'] as const;
export const sharedDoc = pgTable('shared_doc', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  fileId: uuid('file_id').notNull().references(() => fileObject.id, { onDelete: 'cascade' }),
  audience: text('audience').notNull(),
  classIds: integer('class_ids').array().notNull().default(sql`'{}'::int[]`), // empty = everyone in the audience
  createdBy: text('created_by').notNull(),
  createdAt: createdAt()
}, (t) => [check('shared_doc_audience', sql`${t.audience} in ('parents', 'teachers', 'both')`)]);

// §20 A parent confirming a child's details are correct, once per academic year.
export const detailsConfirmation = pgTable('details_confirmation', {
  studentId: integer('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
  academicYearId: integer('academic_year_id').notNull().references(() => academicYear.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contact.id, { onDelete: 'set null' }),
  confirmedAt: tz('confirmed_at').notNull().defaultNow()
}, (t) => [primaryKey({ columns: [t.studentId, t.academicYearId] })]);
