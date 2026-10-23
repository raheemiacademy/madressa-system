import { sql } from 'drizzle-orm';
import {
  bigserial, boolean, check, date, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, uuid
} from 'drizzle-orm/pg-core';

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
  createdAt: createdAt()
}, (t) => [
  uniqueIndex('login_identity_portal_email_uq').on(t.portal, sql`lower(${t.email})`),
  uniqueIndex('login_identity_admin_staff_uq').on(t.adminStaffId),
  check('login_identity_admin_link', sql`${t.portal} <> 'admin' or ${t.adminStaffId} is not null`)
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
