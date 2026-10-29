# DECISIONS

Status: **Phase 0 approved 23/10/2026. Phase 1 (Foundation) built on branch `phase-1-foundation`.** See §6 for what Phase 1 changed or decided.

Inputs read in full: `design-reference/DESIGN.md`, `feature-inventory.md` (§1–§20), `dashboard/index.html`, and all 11 `mobile/*.dc.html` screens (Main, AdminStudents, AdminFees, AdminDrill, TeacherToday, TeacherRegister, TeacherHomework, ParentHome, ParentFees, ParentAbsence, ParentHomework).

---

## 1. Stack

| Concern | Choice |
|---|---|
| Web framework | Next.js 15 (App Router) + React 19 + TypeScript (strict) |
| Database | PostgreSQL 16 (+ `pg_trgm` extension for search) |
| ORM / migrations | Drizzle ORM + drizzle-kit (SQL migrations checked into git), `postgres` (postgres.js) driver |
| Validation | Zod at every server entry point |
| Auth | Own session auth, following the Lucia guide: argon2id, hashed opaque session tokens in Postgres, one cookie per portal |
| Authorisation | One server-side policy module (`can()` + scoped query helpers), called by every server action and route handler |
| Background jobs | pg-boss (Postgres-backed queue + cron) in a separate `worker` process |
| PDF | Playwright Chromium (HTML → PDF) for documents; pdf-lib for certificate overlays on uploaded PDFs |
| Email | `EmailTransport` interface: SMTP driver (nodemailer) + `log` fake. Every email goes through a `mail_queue` table |
| SMS | `SmsProvider` interface: ClickSend and VoodooSMS drivers (plain `fetch`) + `log` fake |
| Payments | Stripe (Checkout + webhooks, test mode), GoCardless (Billing Requests + webhooks, sandbox), bank transfer (manual reconciliation) |
| File storage | `Storage` interface: local-disk driver (dev/test) + S3-compatible driver (production, UK region) |
| Styling | Plain CSS + CSS Modules, design tokens as CSS custom properties. No CSS framework, no component library |
| Charts | d3 (same as the dashboard mockup) |
| Rich text | Tiptap (newsletters, templates editor), output cleaned with sanitize-html |
| Dates | `date-fns` + `@date-fns/tz`; Hijri via built-in `Intl` `islamic-umalqura` calendar |
| CSV / Excel | papaparse; exceljs (class import from Excel) |
| PWA | Hand-written `manifest.webmanifest` per portal + a small service worker (no plugin) |
| Tests | Vitest (unit + integration against a real Postgres test DB), Playwright + @axe-core/playwright (e2e, a11y, 390/860/1440 × light/dark screenshots) |
| Lint / types | ESLint (`eslint-config-next`), `tsc --noEmit` |

### Why each, and the main trade-off

**Next.js (App Router), one app, four portals.** Route groups `/(admin)`, `/teacher`, `/parent`, `/student`, plus public `/apply` and `/kiosk`, all share one codebase, one DB layer and one policy module. Server Components let most of the ~150 CRUD screens render on the server with no client data layer. Server Actions handle forms and check `Origin` for CSRF. The dashboard charts, register grid and hold-to-confirm button are small client islands. The PWA portals are the same routes behind a mobile layout. *Trade-off:* App Router caching can surprise you. I'll set `dynamic = 'force-dynamic'` on authenticated pages so nobody ever sees cached data that belongs to another user. I also considered Django + htmx, which suits CRUD well, but it gives weaker end-to-end typing and two languages once the d3/PWA client code is added.

**PostgreSQL 16.** Several hard requirements depend on it: real transactions for money, partial unique indexes for idempotent invoice generation, `timestamptz`, row locks (`FOR UPDATE SKIP LOCKED`) for queues, `pg_trgm` for global search, and `pg_dump`/`pg_restore` for the backup feature. *Trade-off:* it needs a running server. SQLite would be simpler to run but can't give the concurrency or the constraints.

**Drizzle ORM + drizzle-kit.** The schema lives in TypeScript and the queries stay close to SQL, so aggregates (fees reports, attendance %) are explicit and typed. It supports partial indexes, check constraints and `numeric`/`integer` types precisely. There is no binary query engine. *Trade-off:* the migration tooling is younger than Prisma's and has no auto-generated down migrations. Migrations will be forward-only, reviewed SQL files.

**Own session auth (not Auth.js / Better Auth).** IBEAMS has four separate logins (admin by staff email, teacher, parent by the email on the child's contact record, student by student email). In a madrasah the same person is often a teacher *and* a parent with the same email. Library user tables enforce one global unique email. I'll use `login_identity` with uniqueness on `(portal, lower(email))` and a link to the staff/teacher/contact/student row. Sessions are 256-bit random tokens, stored SHA-256-hashed, in `httpOnly; Secure; SameSite=Lax` cookies scoped per portal, with sliding expiry. Passwords use argon2id (`@node-rs/argon2`). There is a first-login "create password" flow by emailed single-use token (§20 parent portal), login rate limiting in Postgres, and kiosk PIN sign-in for teacher logs only (§7). *Trade-off:* we own security-critical code (~300 lines). I'll mitigate that with dedicated tests: token hashing, expiry, fixation, cross-portal cookie isolation, and lockout.

**Authorisation module.** Every check runs on the server:
- **Admin staff:** `Super`, `Can Edit`, `Can Delete`, `Access Fees Area`, `Marketing`, `Send SMS` (§3).
- **Teachers:** only the classes listed in `class_teacher`, and within those only the privileged actions (register, EOTY, messaging, merits, homework, incidents) (§5). Portal hide-sections (§4) also apply.
- **Parents:** only students linked through `student_contact` with portal visibility on and the contact not blocked. Contact-type access control applies, and hidden sections return 404 (§4, §20).
- **Messaging:** the 9 route toggles from §4.

Queries for portal users always go through scoped helpers (`studentsVisibleTo(actor)`), never raw table access. *Trade-off:* every new query has to use the helpers. A lint rule plus permission tests per module enforce it.

**pg-boss.** It provides a queue, retries and cron on the Postgres we already have, with no Redis. A separate `worker` process runs: the mail queue sender (with the per-minute SMTP limit from §4), SMS sending, the fees scheduler (auto invoice generation), attendance alerts, receipt/reminder batches, PDF batch renders and the nightly backup. Worker heartbeats feed the "Check Automation Services Status" page (§3). *Trade-off:* two processes to deploy and monitor, and no serverless hosting.

**PDF: Playwright Chromium + pdf-lib.** The templates editor (§19) makes email and PDF templates admin-editable HTML, so HTML → PDF in headless Chromium gives one template language and good table and Arabic text rendering (receipts, fees history, registers, class summaries, EOTY reports, data-update forms, incident reports). pdf-lib positions name, achievement, badge and address onto an uploaded certificate PDF (§18). Playwright is already the e2e test runner, so it's one dependency for both jobs. *Trade-off:* Chromium adds ~300 MB to the worker image, and renders cost ~0.3–1 s each, so batch PDFs run in the worker, not in the request.

**Email abstraction.** The §4 Mail/SMTP settings are "paid SMTP or private SMTP (host, port, encryption, sender, per-minute limit, username, password)", so SMTP via nodemailer covers the real requirement. Any provider (Postmark, SES, etc.) can be used through its SMTP endpoint. Every email is written to `mail_queue` first. That table *is* the Mail Queue Manager (§19) and the email delivery tracking log (§3). The `log` driver is the default in dev and test, so no real email is sent until you say so. *Trade-off:* no provider-specific delivery webhooks (bounces). The inventory's "delivery tracking" only lists Date/Subject/To/Sent By/CC/BCC, which the queue table covers.

**SMS abstraction.** ClickSend and VoodooSMS are the two API providers named in §11. Each is ~40 lines of `fetch`, so no SDKs. A `log` fake is the default. *Trade-off:* the third §11 option, "one-click/app", is unclear (see Questions).

**Payments.** Stripe and GoCardless use their official Node SDKs (`stripe`, `gocardless-nodejs`) in test/sandbox mode only. Webhooks are verified by signature and de-duplicated by event ID (`gateway_event` unique). A payment is only marked `Cleared` from a webhook, never from the browser redirect. Bank transfers show the §4 account details and a reference built from the template variables (`{CONTACT_ID}`, `{STUDENT_IDS}`…). Office staff reconcile them on the Bank Transfers page (§2). *Trade-off:* webhook handling needs a public URL in dev. I'll use the Stripe CLI and GoCardless sandbox forwarding, and fakes in automated tests.

**Plain CSS with tokens.** `dashboard/index.html` already gives exact CSS (`.ra-*` classes, container queries, motion). Porting it to CSS Modules over a `tokens.css` keeps the values 1:1 and satisfies "no raw hex in components". Tailwind would mean re-expressing every value. *Trade-off:* no utility shortcuts, and some repetition across modules.

**Fonts.** Inter and Fraunces are self-hosted through `next/font` (files bundled at build time). The mockups load Google Fonts from the CDN at runtime, which sends every parent's IP address to Google. That is a UK GDPR issue for a children's-data system, so I won't do it.

**Testing.**
- **Vitest:** unit tests (money maths, reference templates, discounts, period generation, DfE codes, plural wording) and integration tests against a real local Postgres test database (`school_test`, migrated once, each test in a rolled-back transaction). Permissions, idempotency and money totals are tested against the real DB, not mocks.
- **Playwright:** end-to-end flows per phase, axe accessibility checks, and screenshots at 390/860/1440 px in light and dark.

*Trade-off:* the integration tests need Postgres running locally.

### Data rules

- **Money.** Integer pence (`integer`, `CHECK >= 0` where relevant). Percent adjustments are stored as basis points. Rounding is half-up to the penny, applied once per invoice line, with the rule tested. Display follows DESIGN.md: `£45`, `£0.50`, never rounded to whole pounds in tables.
- **Time.** Instants (payments, sign-ins, messages, audit) are `timestamptz`, stored in UTC and shown in `Europe/London`. Calendar facts (DOB, register date, invoice due date, holiday dates) are `date` columns read in the school timezone from Local Settings (§4). Storing those as midnight instants is the classic BST off-by-one bug. Formatting is en-GB, DD/MM/YYYY.
- **Idempotent invoices.** Each generated invoice has a deterministic `generation_key` (`structure-period:{periodId}:{index}:student:{id}`, `contribution:{id}:student:{id}`, `event-optin:{id}`) and a unique index on it. Generation uses `INSERT … ON CONFLICT DO NOTHING` in one transaction. Deleting an invoice soft-deletes it and keeps its key. "Generate missing invoices" skips deleted keys. "Force Generate Invoices" (typed school name + audit entry) may revive deleted keys, but still produces at most one live invoice per key.
- **Destructive actions.** Bulk delete, restore and force-generate need the typed school name (compared server-side, case- and whitespace-normalised) and write an `audit_log` row in the same transaction.
- **Sensitive fields.** NI number, teacher bank details, and medical notes are encrypted at the application level (AES-256-GCM via `node:crypto`, key from `DATA_ENCRYPTION_KEY`). A plain `has_medical` flag supports the "medical only" filter.
- **Seed data.** Obviously fictional names (e.g. "Test Student 014", "Sample Parent A"), `example.org` emails and `07700 900xxx` Ofcom drama-range numbers. Nothing from the mockups.
- **Tenancy.** One school per deployment and database. No multi-tenancy.

### Full dependency list (anything else = I ask first)

Runtime: `next`, `react`, `react-dom`, `drizzle-orm`, `postgres`, `zod`, `@node-rs/argon2`, `pg-boss`, `nodemailer`, `stripe`, `gocardless-nodejs`, `playwright` (Chromium for PDFs), `pdf-lib`, `d3`, `papaparse`, `exceljs`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, `sanitize-html`, `date-fns`, `@date-fns/tz`, `@aws-sdk/client-s3`.
Dev: `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/d3`, `@types/papaparse`, `@types/nodemailer`, `@types/sanitize-html`, `eslint`, `eslint-config-next`, `drizzle-kit`, `tsx`, `vitest`, `@playwright/test`, `@axe-core/playwright`.

Hand-written instead of adding dependencies: ICS feed, the `{VAR}` template substitution (HTML-escaped), the SMS drivers, the PWA service worker, icons (inline SVG from the designs), dialogs (native `<dialog>`), menus (native popover).

Package manager: npm (installed). pnpm is not installed and isn't needed.

---

## 2. Database entities (planned)

**Foundation and administration**
- `school_profile`: singleton; name, logo, address, emails (no-reply, BCC, receipt sender), tel, fax (§3).
- `setting`: one row per settings tab, JSON validated by a Zod schema per tab (§4).
- `academic_year`: title, start, end, is_current (§3).
- `admin_staff`: name, contact numbers, rank, role, DBS number/issue/expiry, access flags (§3).
- `login_identity`: portal (admin/teacher/parent/student), email, password hash, FK to the staff/teacher/contact/student row, allow_login, lockout counters.
- `session`: hashed token, identity, portal, expires_at, last_seen, IP/UA.
- `auth_token`: single-use set-password or reset tokens (hashed).
- `audit_log`: date, actor, action, page, entity, details JSON (§3).
- `system_log`: category (System/Parent/Student/Teacher/Staff/Contact/Notification), message, actor (§3 Logs).
- `sticky_note`: page path, text, colour, author (§1, §19).
- `holiday`: title, description, start, end, per-portal visibility, students/teachers attend; plus `holiday_class` (§3).
- `year_group`: label, min age, max age (§4).
- `custom_field` + `custom_field_value`: entity type, label, question, type, options, searchable, on registration page (§4).
- `file_object`: storage key, filename, MIME type, size, purpose, owner (uploads, photos, attachments, images).

**People (§5)**
- `student`: names, DOB, gender, status, class, contact details, start/left dates, notes, encrypted medical notes, has_medical, photo.
- `contact`: names, tel/mobiles, email, address, postcode, active; plus `contact_group` and `contact_group_member`.
- `student_contact`: type (Parent/Sibling/Emergency/Other), relation, is_primary, portal_visible, portal_blocked.
- `sibling_link`: registered sibling pairs.
- `teacher`: personal and employment fields, kiosk PIN hash, encrypted NI number and bank details, DBS; plus `teacher_emergency_contact`.
- `teacher_working_hours`: teacher, weekday, start, finish.
- `classroom`: rooms and locations.
- `subject`: shared by timetables, exams and diaries (§15).
- `class`: year, name, year group, main teacher, capacity, start/end, own fee structure or default, custom order.
- `class_teacher`: class, teacher, privilege flags (register, eoty, messaging, merits, homework, incidents).
- `class_assignment`: student class history (from, to, class, year).
- `timetable_template`, `timetable_slot`: class or template, weekday, teacher, start, duration, room, subject, takes_register.
- `school_day`: weekdays the school runs.
- `application_group`, `application`, `application_choice`: public and adult registration forms (applications arrive as Waiting List students).
- `walk_home_consent`: student, contact, given_at, source (portal or manual).

**Attendance (§6, §7, §19)**
- `attendance_code`: classic set or DfE codes (code, description, type, keys, counts as late).
- `register_session`: class, date, timetable slot, taken_by, completed_at.
- `attendance_mark`: student, session, code, late minutes, left-early minutes, authorisation, notified, note; unique on (student, session).
- `absence_notice`: parent "absent today" / "late today" notices, with expected arrival time.
- `holiday_request`: ref, contact, students, dates, request, response, status.
- `attendance_alert_rule`, `attendance_alert_sent`: threshold %, counts, interval.
- `teacher_log`: teacher, date, time in, time out, absent, source (portal/kiosk/admin/import), pending.
- `fire_drill`, `fire_drill_class`: initiated_by, started/ended, per-class "all safe" marks.

**Fees (§2, §4)**
- `fee_structure`: year, name, is_default, is_ad_hoc; plus `fee_structure_class`.
- `fee_period`: structure, name, invoice count, interval (days/weeks/months), amount_pence, start rule, due rule.
- `invoice`: type, student, academic year, billing contact plus name/address/notes, invoice date, period from/to, due date, amount_pence, description, generation_key (unique), source FK (period/contribution/event/product), deleted_at.
- `payment`: invoice, amount_pence, received date, method, status, reference, receipt number, receipt sent state (unsent/sent/manual/no-email), gateway IDs, checkout_group.
- `fee_adjustment`: student standing adjustment (deduct/add, pence or bps, free).
- `sibling_discount_set`, `sibling_discount_rule`: per sibling position, deduct/add, amount, unit.
- `contribution`: one-off charge (description, amount, invoice date, due date, audience).
- `direct_debit_mandate`: contact, provider, mandate ID, status.
- `gateway_event`: provider plus event ID (unique) for webhook idempotency.
- `reminder_run`: who, filters, invoices included, sent_at.

**Communication (§10, §11, §19)**
- `message_thread`: subject, for-attention-of (all admins or a rank), locked, archived.
- `message`: thread, sender (kind, id), body, attachment.
- `message_participant`: thread, participant (kind, id), read_at per message.
- `newsletter`, `newsletter_recipient`: from, subject, audience, template, signature, body, last sent.
- `template`: group, key, version name, subject, HTML body (email and PDF templates, §19).
- `mail_queue`: to, from, subject, CC, BCC, attachments, status, attempts, sent_at, sent_by (queue and delivery log).
- `sms_template`: category, system key, body with variables.
- `sms_message`: recipient, body, status, provider ID, credits, sent_by.

**Learning (§8, §9, §12–§18)**
- `homework`, `homework_target`, `homework_submission`, `homework_template`.
- `exam`, `exam_paper`, `exam_result`.
- `semester`, `semester_exam`.
- `quiz`: field detail limited (see Questions).
- `grading_system`, `grade_band`.
- `eoty_report`, `eoty_question`, `eoty_score_label`, `eoty_entry` (student comments and scores), `paragraph_template`.
- `incident`, `incident_template`.
- `merit`, `merit_award`, `achievement`.
- `certificate_template` (PDF plus field positions), `certificate`.
- `merit_team`, `merit_team_member`, `team_competition`.
- `forum_category`, `forum_category_class`, `forum_post`.
- `event`, `event_timeslot`, `event_consent_item`, `event_price_item`, `event_optin` (consents, items, invoice).
- `product`, `product_sale`, `product_sale_item` (merit purchases included).
- `diary_*`: depends on the answer to the Student Diary question.

**Ops (§3, §19)**
- `backup`: date, by, size, type, storage key, checksum.
- `api_key`: hashed key, scopes (students, contacts, diaries), last used.
- `worker_heartbeat`: process, last_beat (system status).
- pg-boss keeps its own `pgboss` schema.

---

## 3. Build phases (rough sizes)

| # | Phase | Inventory | Size |
|---|---|---|---|
| 0 | Stack and plan (this file) | — | done once approved |
| 1 | Foundation: scaffold, tokens, app shell (sidebar, top bar, global search, year switcher, sticky notes), auth for all 4 portals, roles and access levels, audit log, academic years, school profile, settings framework and all §4 tabs' storage | §1 shell, §3, §4 | L (~25 screens) |
| 2 | People: students, contacts, siblings, teachers and working hours, classes, timetables, year groups, custom fields, registration forms, imports and exports | §5 | XL (~45 screens) |
| 3 | Attendance: classic and DfE registers, daily and monthly grids, mark absent, mass authorise, holiday requests, parent notices, alerts, stats, teacher logs, kiosk, fire drill | §6, §7, §19 drill | L (~25 screens) |
| 4 | Fees: structures, generation, payments, adjustments, sibling discounts, contributions, receipts, reminders, bank transfers, DD stats, reports, imports, diagnose, gateways | §2, §4 fees and gateways | XL (~30 screens + webhooks) |
| 5 | Communication: messages with routing and locking, newsletters, SMS, templates editor, mail queue | §10, §11, §19 | L (~15 screens) |
| 6 | Learning: homework, exams, grades, semesters, EOTY with PDF, incidents, merits, certificates, teams, forums, events, products, diary | §8, §9, §12–§18 | XL (~40 screens) |
| 7 | Dashboard against real queries | §1 | S |
| 8 | Portals: parent, teacher and student portals plus mobile screens, hide-sections and privileges enforced server-side | §4 portals, §20 | L (~25 screens) |
| 9 | Ops: backups and restore, logs, email tracking, system status, ICS feed, developer API | §3, §19 | M |

Every phase ends with the `done_per_phase` checklist: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, and screenshots at 390/860/1440 in light and dark.

---

## 4. Not in the inventory / needs your decision

These block or shape later phases. Phase 1 can start without answers to 3–9.

1. **Project location. Decided: GitHub repo `raheemiacademy/madressa-system`.** It is empty, and account `ml4248` has write access but not admin. Two things are still open:
   - **Visibility:** the repo is **public**. The code has no data in it, but a public repo means one mistaken commit of a `.env`, a backup or a real export puts children's data on the internet. `design-reference/feature-inventory.md` also names the school's live admin URL. **Recommendation:** make it private. An org admin has to do this, because `ml4248` can't.
   - **Local clone:** clone outside Google Drive (e.g. `C:\dev\madressa-system`). If it lives in `G:\My Drive\…`, `node_modules` (~40k files) and `.next` sync constantly and can lock or corrupt files mid-build.

   Work goes on feature branches, one PR per phase. Nothing is pushed without your go-ahead.
2. **PostgreSQL isn't installed** (and neither is Docker). **Recommendation:** install PostgreSQL 16 for Windows locally, used only for throwaway `school_dev` and `school_test` databases. Docker Desktop is the alternative. I won't download or install anything without your OK.
3. **PayFast.** It's listed in §4 Payment Gateways, but your brief names only Stripe, GoCardless and bank transfer. PayFast is a South African gateway. Skip it? (Skipping needs your sign-off.)
4. **IBEAMS vendor-specific items:** "IBEAMS news/updates feed" (§1), "IBEAMS newsletter subscription" (§4 Preferences), "subscription and invoices" and "telephone support" (§3 System page), Help & Support (tickets, remote support, rate us), "Mobile/tablet app (app.ibeuk.org)", "WordPress plugin", "Free services", "hosted by IBEUK or download a single file" portals (§19), "Android app PIN" (§4), and FTP "paid storage (1 GB) / own server upload script URL" (§4).
   **Proposal:**
   - Skip the vendor-service items.
   - Map FTP to a storage quota plus the allowed-extensions list, on our own storage.
   - Map "embed code" for the registration form to an iframe snippet, with no WordPress plugin.
   - Make the Android app PIN unnecessary, because the PWAs use normal login.
5. **Student Diary (§12).** The inventory says the inner pages weren't visible, so the field-level detail is unknown. Building it means inventing fields. Do you have a spec, or should it be skipped or kept minimal (syllabus, subject, assignment and a daily entry)?
6. **Quizzes (beta) (§15).** Only the header fields are listed (subject, title, start/end, teacher, classes, status). There's nothing on questions, answers or marking. Build just the listed fields, specify further, or skip?
7. **Student portal (§20).** Beyond login, custom links and messaging, its sections are "unconfirmed". Build only those three?
8. **SMS "one-click/app" option (§11).** It's unclear what this is (probably sending from IBEAMS's own phone app). Skip it and offer ClickSend and VoodooSMS only?
9. **Spell checker (§4, GrammarBot).** It's an external service that needs a key. Build the settings tab and a driver behind a fake, and call the real service only when you say so?
10. **Fire drill phone alerts.** The `AdminDrill` copy says "Teachers are alerted on their phones", but the inventory only specifies emails (to admins, and class attendance to teachers, §4 Fire/Drills). I'll follow the inventory (email) and change the copy to match, unless you want web push (not in the inventory; it would be a new dependency).
11. **Hosting.** Not in the brief. The stack assumes a long-running Node host (web and worker processes, Chromium) with Postgres and S3-compatible storage in a UK region. You don't need to decide before Phase 9, but it affects how backups and restore are wired.
12. **Dark theme values.** DESIGN.md gives light-surface colours only. The mockup reads host tokens (`--color-bg`, `--color-panel`…). I'll derive dark surfaces from ink (`#1C2147`) and use the specified on-dark accent `#819FEB`, keeping AA contrast. Recorded here as a decision, not a question.


**Your answers (24/10/2026).** Skipped and later items are kept in `FUTURE.md`.
- **3. PayFast:** skip.
- **4. IBEAMS's own services:** skip. You'll build your own versions later.
- **5. Student Diary:** waiting for your details. Not built until then.
- **6. Quizzes:** build only the listed header fields (Phase 6).
- **7. Student portal:** not now. It's in the future list. What Phases 1–2 already made (the `/student` login page, student login emails and the Student portal settings tab) is left as it is.
- **8. SMS "one-click/app":** replaced by a **WhatsApp button** (Phase 5). It opens WhatsApp (app or web) to the contact's number with a pre-written message. Nothing is sent by the system.
- **9. Spell checker:** skip. Its settings tab is removed.
- **10. Fire drill alerts:** email only for now. Phone alerts are in the future list.
- **11. Hosting:** real hosting once the project is complete. The free Render preview stays until then.
- **13. Real PDFs:** switch the preview to Docker so Chromium can render PDFs.
- **14. Logins:** no "open the portal as this person". Instead, **teachers get invite-style logins** (Phase 5, once email works):
  - The admin sets the teacher's email.
  - On first sign-in the teacher is emailed a link that verifies the address and lets them set their own password.
  - If an admin set a password for them, the next sign-in or password reset forces them to choose their own.
---

## 5. Environment variables (each phase adds its own to `.env.example`)

`DATABASE_URL`, `DATABASE_URL_TEST`, `APP_URL`, `DATA_ENCRYPTION_KEY`, `TRUST_PROXY`, `SEED_ADMIN_PASSWORD`, `BACKUP_ENCRYPTION_KEY`, `EMAIL_DRIVER` (log|smtp), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMS_DRIVER` (log|clicksend|voodoo), `CLICKSEND_USERNAME`, `CLICKSEND_API_KEY`, `VOODOO_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GOCARDLESS_ACCESS_TOKEN`, `GOCARDLESS_ENVIRONMENT` (sandbox|live), `GOCARDLESS_WEBHOOK_SECRET`, `STORAGE_DRIVER` (local|s3), `STORAGE_LOCAL_DIR`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `GRAMMARBOT_API_KEY`.
SMTP and SMS credentials can also be set in Settings (§4). DB-stored secrets are encrypted with `DATA_ENCRYPTION_KEY`. Environment variables take precedence.

---

## 6. Phase 1 record

**Changes to the approved plan (small; flag any you disagree with)**
- **Next.js 15.5.28** (the maintained 15.x backport line) as approved. Next 16.4 is now the current major; moving to it is a stack change, so I haven't. It would also remove the PostCSS advisory below.
- **`postcss` pinned to 8.5.31 via npm `overrides`.** Next 15.5 bundles a PostCSS version with a published advisory; the override fixes it without a new dependency.
- **Known dev-only advisory:** `drizzle-kit` pulls an old `esbuild` (moderate, dev server CORS). It isn't shipped or run as a server.
- **One global component stylesheet (`src/styles/ui.css`) instead of CSS Modules.** It's a 1:1 port of the dashboard mockup's `.ra-*` classes, which keeps values identical to the design. Colours live only in `tokens.css`; a test fails if any other stylesheet has a raw hex value, and an ESLint rule does the same for JS/TS.
- **`SESSION_SECRET` dropped.** Session tokens are random and stored hashed, so no signing secret is needed. Added `TRUST_PROXY` and `SEED_ADMIN_PASSWORD`.
- **Postgres installed with winget** (PostgreSQL 16.15, service `postgresql-x64-16`). Role `school_app` owns throwaway `school_dev` and `school_test`. The superuser password is in the git-ignored `.pg-local-secret`.

**Decisions made in Phase 1**
- **Admin URLs** live under `/admin`; portals under `/teacher`, `/parent`, `/student`. Each portal has its own cookie (`sid_<portal>`, `Path=/<portal>`), so a session from one portal is never accepted by another (tested).
- **Session lifetimes:** admin and teacher 12 hours, parent and student 30 days, sliding once half has passed. Staff cookies end when the browser closes.
- **Login protection:** 5 wrong passwords lock that account for 15 minutes; 30 attempts per 15 minutes per IP (or per email when no trusted proxy IP is available, so one attacker can't lock everyone out). Unknown email and wrong password give the same message and take the same time.
- **Who can reach Settings:** the whole Settings area (school profile, academic years, holidays, admin staff, audits and every §4 tab) needs the **Super** access level. Other access levels are enforced as their modules arrive. Every page and server action calls `requireAdmin(level)`; hiding a link is never the check.
- **Safeguards:** you can't delete yourself, and the last super admin with login can't lose Super access or be deleted. Changing a password, turning login off, or changing the login email signs that person out everywhere.
- **Secrets in settings** (SMTP password, GrammarBot key) are AES-256-GCM encrypted, never sent back to the browser, and audited by field name only.
- **Settings tabs** are defined once in `src/settings/tabs.ts`; the same definition renders the form and builds the server-side validation.
- **Uploads** (logo, portal backgrounds) are checked by their actual bytes, not the browser-supplied type: PNG/JPEG/WebP up to 5 MB, MP4/WebM up to 20 MB. Only branding files are publicly served.
- **Interpretations of the inventory** (tell me if any are wrong):
  - "Photo timeout" (§4 Preferences) is read as seconds a student photo stays visible.
  - "FTP" (§4) is mapped to a storage limit plus an allowed-extensions list, as proposed in question 4.
  - Messaging route defaults: teacher→admin, teacher→primary contacts, teacher→teacher and contact→admin are on; the rest are off.

**Phase 1 gaps (deliberately deferred; each lands in the phase named)**
- **Global search** shows its box, `/` shortcut and results page, but students, contacts and teachers don't exist until Phase 2, which adds their queries.
- **Top-bar notification and message icons** (with count badges), and the **fire-drill hold button** in the sidebar, are left out until Phases 3 and 5 build what they link to.
- **Dashboard** shows only the greeting hero; the full dashboard is Phase 7.
- **Academic year:** New Year Wizard step 1 (set the new year) is built. Migrating classes, timings and students needs classes (Phase 2), as does Yearly Comparison Stats and "Default yearly fees" (Phase 4 fees structures).
- **Holidays:** "which classes it applies to" needs classes (Phase 2); "Send Holidays Newsletter" needs newsletters (Phase 5); **PDF** download is replaced by a print layout until the PDF worker lands (Phase 3). Year Calendar has the same print layout.
- **§3 Backup, System page, Logs and email delivery tracking** are Phase 9, as the build plan says.
- **§4 App Settings (Android app PIN)** and the IBEAMS newsletter preference wait on question 4.
- **§4 Register:** the DfE code editor is built with registers in Phase 3; Phase 1 stores the register type and order.
- **§4 Year & Age Groups, Custom Fields** (Phase 2) and **Payment Gateways** (Phase 4) are in the phases the build plan names.
- **Teacher, parent and student portals** have working login pages and session checks, but nobody can hold those logins until Phase 2 creates teachers and contacts. Their homes are placeholders until Phase 8.
- **Admin mobile app screens** (`Main`, `AdminStudents`, `AdminFees`, `AdminDrill` with a bottom tab bar) are built with each module and the portals. Phase 1 follows the dashboard's narrow-screen rule (horizontal scrolling nav, stacked cards).
- **S3 storage driver:** local disk only for now; S3 comes with deployment (Phase 9).

**Commands**
- `npm run db:migrate` / `npm run db:seed` (dev DB; the seed is fictional and needs `SEED_ADMIN_PASSWORD`)
- `npm run lint`, `npm run typecheck`, `npm test` (Vitest, real `school_test` DB), `npm run test:e2e` (builds, then Playwright against `school_test`)
- `npx playwright test e2e/visual.spec.ts` writes 390/860/1440 × light/dark screenshots to `screenshots/` (git-ignored)

## 7. Hosted preview (Render)
- `render.yaml` defines a preview on Render, Frankfurt region: one web service plus Postgres 16 reachable only from Render's private network. It deploys the **`preview`** branch, and every push to that branch redeploys.
- On each start it runs migrations and the fictional seed. `SEED_ADMIN_PASSWORD` is typed into Render, never committed. `DATA_ENCRYPTION_KEY` is generated by Render, so key parsing now accepts base64 as well as hex.
- Since 24/10/2026 (question 13) the preview builds from the `Dockerfile` on Render's Docker runtime. The image includes Chromium (installed with the approved `playwright` package), so the server can render real PDFs. The build checks that Chromium launches. On start the container migrates, seeds and runs `next start`.
- Preview limits: free plans sleep when idle, and free Postgres is time-limited on Render. Uploads are lost on each deploy (local disk). This is a preview, not production hosting; question 11 is still open for real hosting.

---

## 8. Phase 2 record (People, §5)

**Added dependencies** (both already on the approved list): `papaparse` (CSV), `exceljs` (class import from .xlsx).

**Decisions**
- **One class field on the student form.** A student can still be in several classes at once (§5 "Multiple Class Students"): add them from the class page or the class history. Class membership is one history table; an entry with no end date is a current class. Class sizes are counted live, so the IBEAMS "Fix Count" tool isn't needed. The maintenance page instead fixes history that should have ended (students who left, last year's classes).
- **Moving classes:** the old class ends the day before the move date and the new one starts on it, so history never overlaps.
- **Leaving statuses** (Relocated/Left, Finished, Expelled, Deceased, Rejected) fill the left date with today if blank, and end the student's classes on that date.
- **Permanent student delete** needs the Can delete access level and the school name typed (case, spacing and curly quotes ignored), and is audited. I applied the inventory's typed-name rule here too, because a permanent delete of children's records is the riskiest action in this phase.
- **Teachers are soft-deleted** so their names stay on past records. Their portal login is removed.
- **Sensitive fields encrypted:** student medical notes, teacher NI number, bank name, account and sort code, and teacher medical information (AES-256-GCM). Teacher profiles show NI and bank details masked; the edit form shows them in full. Kiosk PINs are hashed.
- **Contacts have an optional gender**, because the §4 "Contacts → Teachers (same gender only)" messaging route needs it. It isn't listed under contact fields in the inventory.
- **Portal logins:** each person's email is their login for their own portal only (unique per portal). The same email can be a teacher login and a parent login. Changing a password, the email, or blocking someone signs them out everywhere.
- **"Quick Check" (siblings)** lists students who share a Parent contact but aren't registered as siblings yet. "Automatically find siblings" registers them.
- **"Switch/Rename Classes"** is built as a page where you rename every class at once; swapping two names switches them. Students stay put. Tell me if IBEAMS meant something else.
- **CSV exports guard against spreadsheet formulas**: cells starting with = + - @ are prefixed so Excel shows them as text. Exports and edit-exports are audited, and the audit records when medical notes are included.
- **Imports always preview first.** Nothing is written until you confirm, and the server re-checks every row on confirm. Rows with an `id` update that record (Export/Import Edit). Bad rows are listed by line number and skipped.
- **Public application form** is at `/apply` (and `/apply/adult`). It's the only page that may be framed, with `frame-ancestors https:`, so schools can embed it. It has a hidden honeypot field for bots and is rate-limited (10 per hour per IP behind the proxy). Children arrive as Waiting List students with the parent as primary contact. The form's open and close times are entered in UK time.
- **Uploads:** student and teacher photos are images checked by their actual bytes. Student attachments must use the school's allowed extensions; script-capable types (html, svg, js, exe…) are always refused, and attachments are only ever served as downloads to signed-in staff.

**Phase 2 gaps (each lands in the phase named)**
- **"PDF" items are print layouts** for now: data update forms, class summaries, the teacher list, student notes, the holiday list and the year calendar. Use the browser's "Save as PDF". See question 13.
- **Student row actions Register, Incidents, Fees and Fees History**, and the profile's fees, merits, certificates and incidents panels, arrive with Phases 3, 4 and 6.
- **Bulk "create admission fees"**, the "create admission fee" option on the student form, and the admission-fee invoice on application need fees (Phase 4).
- **"When marking someone left" options:** delete unpaid invoices (Phase 4), delete register entries (Phase 3), and send the "student left" email (Phase 5).
- **Class cards' register chip and "attendance this month"** need registers (Phase 3). **"Fee per year"** and the class's "own fees or the default structure" option need fees (Phase 4).
- **"Portal Login" row actions** for students and teachers (open their portal as them) wait for the portals in Phase 8. See question 14.
- **Walk-home consent from the parent portal** arrives in Phase 8. Staff can record it by hand now.
- **Admin mobile app screens** (`AdminStudents` with its bottom tab bar) are in Phase 8, as planned. On phones the admin web pages follow the dashboard's narrow-screen rules.

**New questions**
13. **Real PDFs.** Server-generated PDFs (Playwright Chromium, approved) work locally. On Render's plain Node runtime Chromium's system libraries aren't available, so the preview would need Render's Docker runtime. Phase 4 needs real PDFs for receipts attached to emails. Shall I switch the preview to Docker when Phase 4 starts, and keep print layouts for the Phase 2 documents until then?
14. **"Portal Login" (§5).** I read this as "open the portal as this person" for support. I'd build it in Phase 8 as Super-only, time-limited, clearly bannered, and audited. Is that what you want, or should it only set or reset the person's portal password (which already works)?

---

## 9. Phase 3 record (Attendance, §6, §7, §19 fire drill)

**Added dependencies** (both on the approved list): `d3` (attendance charts), `@types/d3`.

**Decisions**
- **Registers come from the timetable.** A class is due a register on each timetable session marked "Takes a register", unless that day is a holiday (whole school or that class) or not a school day (Settings → School days). A register is one row per class, date and start time, so saving it again updates it in place.
- **Marks:** present, late (with minutes), absent, left early (with minutes), or not counted. An absence's authorisation is yes, no or **not decided yet**, and is kept separate from "parent notified". In **DfE mode** (Settings → Register) every mark needs one of the 22 DfE codes, which are seeded and can be edited under Settings → Attendance codes.
- **Percentages:** standard % = (present + late) ÷ counted sessions. Strict % = on-time present ÷ counted sessions. Not-counted codes are left out of both.
- **Quality bands** (student record): Excellent ≥ 97%, Good ≥ 95%, Needs improvement ≥ 90%, otherwise Serious concern. The inventory names the bands without thresholds, so these are my numbers.
- **Accepting a holiday request** marks the child absent (authorised) on every register they're due in that range. Declining marks nothing. Parent absence notices must be for today or later.
- **Double entries** means the same student marked on two registers with the same date and start time (usually two classes). "Fix" keeps the most recently saved mark and deletes the others (audited).
- **Deleting register entries** (a date range, a class or students) needs the Can delete level and the school name typed, and is audited. When a student is marked as leaving, an option deletes their register entries **after** the left date. This doesn't need the typed name, because it can't touch entries on or before the date they left.
- **Teacher logs:** "Pending logs" means a teacher due by their working hours with no log, or signed in but never signed out. Absentees are teachers marked absent.
- **Kiosk:** `/kiosk` only works on a device a Super admin has set up from Teacher logs → Kiosk devices. That sets a long-lived token cookie, which is stored hashed and can be revoked. Teachers sign in or out with their kiosk PIN, with 5 tries per 15 minutes per device.
- **Fire drill:** a 2-second hold starts it (Space or Enter works too), and only one drill can run at a time. The roll call lists who is on site per class from today's registers, falling back to class lists where no register has been taken. Classes are marked safe one by one. With "Process attendance without confirmation" on, every class counts as safe at once. Ending a drill keeps it in History with its times.

**Phase 3 gaps (each lands in the phase named)**
- **Emails:** attendance alert emails, the fire drill emails to admins and teachers, and the parent emails for absence notices and holiday request replies need the mail queue (Phase 5). The Alerts page already lists exactly who would be emailed.
- **"Download register"** and the teacher log **print** are print layouts until real PDFs arrive (question 13).
- **Parent-side absence notices and holiday requests** are entered by staff for now. Parents submit them from the parent portal in Phase 8.
- **Teacher-portal register taking** (teachers with the Register privilege) is Phase 8. Until then only admin staff (Can edit level) take registers. That check, plus the per-class Register privilege, will be enforced on the server.
- **Dashboard attendance tiles and chart** are Phase 7. The Register page shows the same weekly trend chart now.
- **Admin mobile `AdminDrill` screen** with its bottom tab bar is Phase 8. On phones the web drill page and the compact hold button in the nav follow the narrow-screen rules.

---

## 10. Phase 4 record (Fees, §2; Fees settings and Payment gateways, §4)

**Dependencies:** none added. Stripe and GoCardless webhook signatures are checked with Node's built-in HMAC, so the `stripe` and `gocardless-nodejs` SDKs (both approved) wait for Phase 8, when the parent portal creates checkouts and mandates. No call to any real payment service is made.

**Decisions**
- **Money** is integer pence everywhere. Percentages are basis points (12.5% = 1250) and round half up to the penny. An adjustment never takes an invoice below £0.
- **Received means cleared.** Only Cleared payments count as received. Pending and Processing are shown separately and count as "spoken for" when recording more payments, so an invoice can't be paid twice while a bank transfer clears. Bounced, Failed and Reversed count as nothing.
- **Invoice status:** Paid (cleared ≥ amount), Overdue (past its due date with a balance) or Balance (still to pay, not yet due).
- **Fee structures:** each class uses its own structure, otherwise the year's default. Ad hoc structures are applied to single students. A fee period issues *Number of invoices* invoices, one every *interval* from its start date, each for *Amount per invoice*. Each invoice covers up to the next one's start, and the last one runs to the period end. "Period start" moves each invoice's period to the first chosen weekday on or after it is issued. The "Nth day" due rules count from the period start. A period is refused if its invoices would be issued after its end date.
- **Idempotent generation:** every generated invoice has a unique key (period, invoice number, student; contribution and student; admission and student). Re-running Generate never duplicates, and a deleted invoice is not generated again. **Force Generate** brings deleted ones back with today's amounts. It needs the school name typed, and it's audited. Options: up to today or the full year, and active (Current) students only. A student is billed for an invoice if they are in the class on that invoice's period start, so late joiners pay from when they join. Editing a structure only affects invoices generated afterwards; Modify Invoices changes existing ones.
- **Adjustments:** one standing adjustment per student: deduct or add £ or %, or Free (no fees invoices at all). It's applied at generation. Sibling discount sets give the 2nd, 3rd… *current* child (eldest by date of birth first) that position's discount. A child beyond the last position gets the last one. "Assign Adjustments Now" never overwrites a manual adjustment.
- **Payments:** Add Fees records a payment against one invoice, or splits it oldest-due-first across a student's or a whole family's invoices. It refuses more than is owed. The receipt number is the payment ID (R123). "Move Here" only moves a payment between the same student's invoices.
- **Deleting:** a single invoice can only be deleted when it has no payments. Bulk delete covers a date range and optional student IDs. It needs Can delete plus the school name typed, refuses while payments exist unless "Also delete payments" is ticked, and is audited with every invoice ID. Invoices are kept as deleted (so generation respects them); payments are removed.
- **Permissions:** every fees page, export and action needs Access Fees Area. Deleting also needs Can delete. Fee options on student forms (admission fee, delete unpaid invoices on leaving) need Access Fees Area too. The Fees menu link and fees row actions are hidden from staff without it, and the server refuses them anyway (tested).
- **Webhooks** (`/api/webhooks/stripe`, `/api/webhooks/gocardless`): the signature is checked on the raw body (Stripe within 5 minutes). Each event ID is processed once (`gateway_event`), and only its type is stored, never the payload. With no secret configured, the endpoints answer 404.
- **Gateway secrets** live in environment variables (`STRIPE_*`, `GOCARDLESS_*`, documented in `.env.example`) or encrypted in Settings → Payment gateways. The environment wins. "Compare rates" is left to each provider's own pricing page.
- **Contacts on invoices:** generated invoices are addressed to the student's primary contact. Choosing another contact on an invoice doesn't copy their name or address (as the inventory says). The annual report "by contacts" uses the billing contact, else the primary contact.
- **Deleting a student** permanently also removes their invoices and payments (the typed-name delete from Phase 2). An academic year with classes or invoices can no longer be deleted.

**Interpretations (tell me if any are wrong)**
- Monthly Fees shows invoices **dated** in the month.
- Outstanding/Reminders: *Overdue* = past due, *Active* = due within 7 days or past, *Upcoming* = not yet due.
- Diagnose checks for: payments on deleted invoices, overpaid invoices, invoices due before they're issued, £0 non-fee invoices, future-dated payments, possible duplicates (same type, period and amount), and fees billed for periods after a student left. It lists them with links and changes nothing.
- "Default yearly fees" (§3) is the year's default structure. The New Year Wizard's new step 4 copies last year's structures, moved on a year, onto classes with the same name.

**Phase 4 gaps (each lands in the phase named)**
- **Emails wait for the mail queue (Phase 5):** sending receipts (Send Selected, Quick Send, "send as attachment"), reminder emails with the editable template and the optional direct-debit link, and the fee emails to parents. Send Receipts can already mark receipts as sent manually or "no email". Reminders prepares the list and downloads it as CSV.
- **"Download PDF fees history" and receipts** are print layouts until real PDFs (question 13).
- **Paying online** (Stripe checkout, GoCardless mandate setup, bank transfer details and reference shown to parents, "force direct-debit setup") is in the parent portal, Phase 8. The webhooks that update those payments and mandates are built and tested now.
- **Invoice type "Products"** is ready, but products themselves are Phase 6 (§17).
- **Admin mobile `AdminFees` screen** with its bottom tab bar is Phase 8. On phones the fees pages follow the narrow-screen rules.

**Questions still open:** 3 (PayFast: not built until you decide), 13 (real PDFs), 14 (Portal Login).

---

## 11. Phase 5 record (Communication: §10 Messages, §11 Newsletters/SMS, §19 Mail queue and Templates)

**Dependencies added** (all on the approved list): `nodemailer` (+ `@types/nodemailer`), `sanitize-html` (+ `@types/sanitize-html`), `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, and `playwright` (already added for the Docker preview, now used for PDFs). **Not used:** `pg-boss`. A small worker loop over the mail and SMS tables (with `FOR UPDATE SKIP LOCKED`, and a once-a-day claim row) did the job without a second queue.

**Decisions**
- **Worker** (`npm run worker`). Every 15 seconds it sends due emails (within Settings → Mail's per-minute limit) and queued texts. Once a day after 06:00 UK time it emails attendance alerts (if they're on) and generates the day's fees invoices for the current year. The preview container runs the worker beside the web server. Failed emails retry with growing gaps and are marked failed after 5 tries.
- **Email and SMS stay in test mode** until you approve real sending. `EMAIL_DRIVER=log` and `SMS_DRIVER=log` (the defaults, used on the preview) log messages instead of sending them. SMTP (system, or the school's own from Settings → Mail) works with `EMAIL_DRIVER=smtp`. ClickSend and VoodooSMS are written to their published APIs but haven't been called, and only run with `SMS_DRIVER=clicksend` or `voodoo`.
- **Real PDFs** (question 13): every print layout now also has **Download PDF**. Chromium opens the same page as the signed-in admin, so the page's own permission checks still apply. Only `/admin/…` paths on our own server are accepted, and any other address is blocked. Receipts can be attached to emails as PDFs.
- **Templates editor** (§19): the built-in wording lives in code; an edit is saved as an override. Extra versions (e.g. "Urgent") can be added, and reminders let you choose one. `{VARIABLES}` are HTML-escaped. Edited HTML is cleaned of scripts and unsafe attributes. `{HIJRI_DATE}` follows Local settings (language, format, offset). The groups shown so far are Fees, Registers, Messaging, Portals and Student; the others (certificates, EOTY reports, homework, incidents) arrive with their features.
- **Messages** (§10):
  - Each recipient of a compose gets their own conversation, so families never see each other. "Pick a class" adds its students' primary contacts.
  - Office conversations are shared by all admins, or by one rank when "for the attention of" is set. Super admins see all.
  - Locked is the same as Archived. Locking stops parents and teachers replying and clears the conversation from unread.
  - Read status is shown per message ("Not yet read" / "Read by …").
  - Delete (bulk, or by date range and person) needs Can delete and is audited.
- **Messaging routes** (§4) are enforced on the server for every portal sender, and tested now so the Phase 8 portals inherit them:
  - Teachers can reach admins and teachers. They can reach primary contacts only of students in classes where they have the Messaging privilege.
  - Contacts can reach admins. They can reach their children's (Messaging-privileged) teachers only if "all genders", or "same gender" with both genders recorded and equal, is on.
- **Message notifications:** recipients get an email with the message and a link, and admins are emailed about portal messages when Preferences → "Email me when a portal message arrives" is on.
- **Newsletters** (§11): audiences are parents of current students, all contacts, active teachers, admins (for testing), student emails, or parents in chosen classes. Each address gets one copy, and `{NAME}` personalises it.
  - The five layout styles are named **Modern, Fresh, Classic, Dark theme, Plain**, because the IBEAMS names (IBE New/IBE Classic) are the vendor's.
  - Image manager files are public, because they appear in emails; the page says so. Newsletters need the **Marketing** access level, and texts need **Send SMS**.
- **SMS:** numbers are normalised with the country code (07… → +44…) and de-duplicated. A text is 160 characters, or 153 each when split. System templates can be reworded but not deleted.
- **WhatsApp button** (question 8): on teacher and contact profiles. It opens `wa.me` (the app, or WhatsApp Web) with a ready-written message from the SMS templates. Nothing is sent by the system.
- **Teacher and parent logins** (question 14):
  - An admin can save just an email. On first sign-in, or from "First time here, or forgotten your password?", the person is emailed a one-time link (48 hours) that confirms the email and sets their password.
  - A password chosen by an admin must be changed after signing in.
  - Profiles show the state (invited / email confirmed / to be changed) and have "Email a set-password link".
  - The "forgotten password" form gives the same answer whether or not the email has an account. One leak remains: signing in with an invited email that has no password yet triggers the link, so it shows that account exists.
  - Admin logins are unchanged.
- **Emails held over from earlier phases now send:**
  - attendance alerts (each morning or "Send now", at most once per look-back period per student);
  - fire drill emails (admins, and each class's main teacher with their roll call);
  - holiday request replies;
  - the "student left" email (a new option when marking a student as leaving);
  - receipts (Send selected, Quick send, optional PDF; a receipt moves to Sent once delivered);
  - fees reminders (one email per family, choosing a template version and an optional direct-debit line);
  - "Send holidays newsletter" (makes a draft from the year's holidays).
- **Header:** a Messages icon shows your unread count. Mail queue and Templates are in Settings (Super).

**Phase 5 gaps**
- **Students as message recipients and senders** wait for the student portal, which is on hold (FUTURE.md). Their routes are not offered.
- **Teacher-portal and parent-portal screens** for reading and sending messages are Phase 8. The server functions and route checks are built.
- **Email delivery tracking and bounce handling** (§3 Logs) are Phase 9.

## 12. Phase 6 record (Learning: §13 Homework, §15 Exams, §16 EOTY reports, §9 Incidents, §18 Merits/Achievements, §17 Products, §8 Events, §14 Forums)

**Dependencies added** (on the approved list): `pdf-lib`, for certificates. Every other PDF (reports, homework year report) uses the Phase 5 Chromium route.

**Decisions**
- **Navigation:** a new **Learning** group: Homework, Exams & reports, Events & trips, Incidents, Merits & shop, Forums. Products sits under "Merits & shop", because the shop sells for money or merits.
- **Homework** (§13): set for a class, from a template or from scratch. Optional files (PDF or image) and an optional "lock after the deadline". Primary contacts are emailed when it's set, with an optional BCC from Settings → Homework. Ticking students done, the incomplete report, reminders (with a "send me a test" option), the year report (print, PDF or email to families) and storage usage are all here. **Parent uploads** of finished work arrive with the parent portal (Phase 8).
- **Exams** (§15):
  - Each exam has papers, and each paper is marked out of its maximum. Marks are kept to one decimal place (stored in tenths). Absent is its own state, not zero.
  - Positions count ties (two students on 87 are both 1st, and the next is 3rd).
  - Status is Open, Closed or Locked. A locked exam refuses result changes on the server, not just in the form.
  - Grading systems are editable. **"Load standard grades"** replaces the IBEAMS "defaults" button with a fictional A*–U set.
  - Semesters combine exams across classes.
  - **Quizzes** keep only their header fields (title, class, date, marks), as agreed for question 6.
- **EOTY reports** (§16):
  - A report sets the term, the questions teachers score (Behaviour, Progress, Effort by default), the score labels, and what to include (exams, positions, attendance, homework).
  - Paragraph templates (5 levels × 3 areas) fill in `{FIRST_NAME}`, `{HE_SHE}` and the like. **When no gender is recorded, the first name is used instead of he/she**, so the text never reads "they works".
  - Paragraphs can be backed up and restored as a file. "Restore defaults" brings back the built-in text.
  - The comments grid, overview, all-comments, and the generated reports (print or PDF per class) are admin pages. **Teachers writing comments** in their own portal is Phase 8; the server functions already check their class privileges.
- **Incidents** (§9):
  - Severities are **Low, Medium, High, Serious**.
  - An incident involves students, a teacher or "other". It can email and text the primary contacts, and can be included in the EOTY report.
  - Templates prefill the form. The 12-month report and CSV export are by severity and class.
- **Merits** (§18):
  - **Sanctions are merits with negative points**, so one total covers both.
  - Merits can go to students or teachers. Totals are by class or person.
  - Achievements fire at a points target (sanction targets count down).
  - Certificate templates place text by **millimetres on an A4-landscape basis**, scaled for other sizes and orientations. Certificates are issued in bulk and downloaded as PDFs (pdf-lib).
  - Teams and competitions total their members' points.
- **Products** (§17): stock, and sales by invoice or by merits. Paying by invoice raises a **Products** invoice. A contact buying for themselves is invoiced against their **first linked student**, because every invoice belongs to a student. Paying by merits checks the balance first. A sale can be marked delivered.
- **Events** (§8):
  - Each event has timeslots with capacity, consents (required or optional) and prices (required or optional).
  - An opt-in without a required consent is refused on the server.
  - With auto-invoice, one **Contribution** invoice is raised per student and event; re-running never adds a second (idempotency key `ev{event}-s{student}`). Withdrawing removes the opt-in and cancels its invoice, unless a payment has been made against it; then the invoice is kept for the office to handle.
- **Forums** (§14):
  - Categories and topics. A locked topic takes replies from admins only.
  - Removed posts stay in the record as "Removed by …".
  - Posting by **teachers and parents** arrives with their portals (Phase 8).
- **Permissions:** every change needs Can edit, deletions need Can delete, and both are checked in the server actions. Pages that only add something (`/new`) also need Can edit. View-only staff can read every Learning page.
- **Student profile:** new Merits, Certificates and Incidents panels. The students list gains an "Incidents" row action.
- **Templates editor:** the Homework (new, reminder, year report) and Incidents groups are added.

**Phase 6 gaps**
- **Student Diary / Daily Progress Tracker** (§12) still waits for the fields you want (FUTURE.md).
- **Quiz questions and online quiz-taking** are left out, as agreed (header fields only).
- **Portal sides** of homework, EOTY comments, events opt-in and forums are Phase 8. The server rules are built and tested.

## 13. Phase 7 record (Dashboard, §1)

**No new dependencies.** The charts reuse `d3`, which was already in use.

**Decisions**
- **What's on it** (as `dashboard/index.html`):
  - a greeting with a one-line summary of the day and quick actions;
  - banners for today's parent absence notices and pending holiday requests, hidden when there are none;
  - KPI tiles;
  - weekly attendance;
  - students by age group;
  - unread messages;
  - teacher sign-in;
  - recent payments and fees by type.
- **Each panel loads on its own.** It shows a skeleton while loading and "Failed to load" if its query fails; the rest of the page still works.
- **Fees figures need Access Fees Area.** For staff without it, the fees parts are left out: the fees part of the summary, the Fees outstanding tile, Recent payments, Fees by type and Record payment. They are not queried, not just hidden.
- **"Since last week" means:**
  - **Students:** joiners minus leavers in the last 7 days, by start and left dates.
  - **Attendance:** the same weekday one week earlier. If either day has no register, the tile says so instead of showing a change.
  - **Fees outstanding:** worked out again from the invoices and cleared payments that had been recorded 7 days ago, for the selected year. Upcoming invoices are included, as on the Fees dashboard. A change of 0 shows as "No change".
- **Parents on portal:** parent contacts of current students who have signed in to the parent portal since the selected year began, out of all parent contacts of current students.
- **Teachers signed in:** everyone due in today by their working hours, plus anyone else who logged today. A teacher marked absent is listed but not counted.
- **Students by age group:**
  - Uses the Year & Age Groups settings and each student's age today.
  - Students with no date of birth go under "No age group".
  - Students with no recorded gender get their own "Not recorded" segment, so the totals are right. The design shows only boys and girls.
- **Weekly attendance** runs from the start of the selected year. The design says "this term", but terms aren't recorded anywhere in the inventory.
- **Unread messages:** the four newest unread office conversations this admin can see (the same rank rules as the inbox), plus "N more" when there are more.
- **Quick actions:** Add student (needs Can edit), Record payment (needs Access Fees Area; opens the same Add Fees dialog), Take register, New message.
- **The tile animation plays on the first view of a session only.** A session cookie, `ra_dash_seen`, remembers this. It's functional only: no tracking, and it's cleared when the browser closes.
- **Shell fix:** at phone width the school-name link in the top bar had no accessible name. The name is now visually hidden but still read out. It was found by the new phone-width axe check.
- **Chart fix:** charts now measure their box before the first draw. Before, they could draw once at a default width and look tiny on phones until they redrew.

**Phase 7 gaps**
- **The IBEAMS news/updates feed** ("Auto-refresh daily") is not built. It's in the "your own versions of the IBEAMS services" item in FUTURE.md.

## 14. Phase 8 record (Portals, §20; Tools → Portals, §19)

**Dependencies added** (both on the approved list, held over from Phase 4): `stripe` and `gocardless-nodejs`. Only test/sandbox keys are accepted: a live Stripe key (`sk_live_…`) or GoCardless "live" environment leaves online payment switched off until you approve real payments. `PAYMENTS_FAKE=1` (tests only, documented in `.env.example`) swaps in fakes, so no automated test calls Stripe or GoCardless.

**Your answers (24/10/2026)**
- **Files / Docs & Files** are *shared documents*: the office uploads a file in Communication → Shared files and chooses parents, teachers or both, and optionally which classes.
- **Holiday requests in the teacher portal** show the requests parents made for students in that teacher's classes, read-only. The office still decides.

**Decisions**
- **Two installable apps (PWAs)** at `/parent` and `/teacher`, following the mobile designs:
  - Bottom tabs: Parents get Home, Attendance, Fees, Homework, More. Teachers get Today, Register, Homework, Messages, More.
  - On wide screens the same layout sits in a centred column.
  - Each portal has its own manifest, icons and theme colour.
  - The service worker only shows an offline page. Pages hold children's data, so nothing else is cached on the device.
  - Mobile baseline: safe areas, 44px+ targets, 16px inputs, press feedback on controls only, light and dark.
- **Server-side permissions** run through one access layer that every portal page, action and file route calls:
  - A parent reaches only children they're linked to as an allowed contact type (Settings → Parent portal), and only children who haven't left. Any other child is a 404.
  - A teacher reaches only their classes this year. Each action checks that class's privilege: registers, homework, merits, incidents, report comments, messaging.
  - Sections hidden in Settings are refused on the server (404), not just left off the menu.
  - A disabled parent portal shows its message and nothing else.
- **Files** are served only when the person can reach them through something they're allowed to see: a shared document for them, homework set for their child or class, a hand-in, an active shop product's photo, or an attachment on their own conversation.
- **Parent portal**
  - **Home:** a child switcher (first names, or full names when two children share one), the next class, attendance %, homework due and merits. Also report absent/late, request a holiday, what's due in fees, and "From the school" (holidays in the next 30 days and events still open for opt-in).
  - **Attendance:** the year's figures, recent registers, and sent notices and holiday requests with the school's answers. A notice goes onto the teacher's register and the office's notices list.
  - **Fees:**
    - All the family's invoices in one list.
    - **Card:** Stripe Checkout for everything unpaid. Each invoice gets a Pending payment that only the Stripe webhook can clear, never the browser redirect. Abandoned checkouts expire and their payments fail.
    - **Direct debit:** set up through GoCardless's hosted page. When it's in place, fees due are collected automatically each morning (the worker), or straight away with "Pay now". An invoice already being paid isn't collected twice.
    - **Bank transfer:** the school's details and the family's reference, built from the Fees settings template.
    - "Make parents set up direct debit" sends them to Fees until they have.
  - **Homework:**
    - Hand in a photo, PDF or recording (mp3, m4a, ogg, webm, mp4), up to 20 MB, checked by its contents, not its name.
    - Only where the teacher allowed uploads and the homework isn't locked.
    - A hand-in counts as handed in. The teacher's tick is still separate.
  - **More:**
    - **Messages:** to the office, or to a child's teacher when the §4 routes allow.
    - **Events:** opt in with the timeslot, consents and optional costs. The cost goes on the family's fees.
    - **Term reports:** only reports the office has switched to "Parents can see it on the parent portal" (a new switch on the report settings).
    - **Exam results:** only once an exam or test is closed or locked. Class positions aren't shown.
    - **Merits** with certificates shown on the portal (PDF).
    - **Incidents** the office chose to share.
    - **Shop:** pay on fees, or with the child's merits.
    - **Files** and **Forums** (classes' forums only).
    - **Your child's details:** confirm once per school year when the school requires it, plus walk-home consent when the school asks for it. Changes go to the office as a message.
    - The school's custom and social links.
- **Teacher portal**
  - **Today:**
    - Sign in and out.
    - Today's timetabled sessions, with whether each register is taken.
    - Homework done, parents' notes for today, and a shortcut to award merits.
    - A banner during a fire drill.
  - **Register:**
    - Today or catching up on the past 7 days, using the same register screen as the office.
    - Parents' notes pre-fill it.
    - Teachers don't set "authorised": the office decides that.
  - **Homework:** set for classes with the privilege (notify parents, allow uploads, lock after the deadline), tick who's done it, open hand-ins, and remind the parents still waiting.
  - **Messages:** to the office, colleagues (when allowed), and the primary contacts of classes with the Messaging privilege.
  - **More:**
    - **Classes and student details:** only the details Settings → Teacher portal allows; medical notes stay with the office.
    - **Merits** and **incidents**: a teacher's incident isn't emailed or shown to parents; the office decides.
    - **Exams and tests:** add for their classes, add papers, enter marks while open.
    - **Report comments and scores** for open reports (with a preview when "teachers can preview" is on).
    - **Events:** who from their classes is going.
    - **Holiday requests** (read-only), **forums**, **docs and files**.
    - **My log:** with today's times editable when "Let teachers adjust" is on.
    - **Fire drill:** a roll call for their classes, with "All safe" per class.
- **Admin additions:**
  - **Communication → Shared files:** add needs Can edit; delete needs Can delete, is audited and removes the stored file.
  - **System → Portals** (§19 Tools): each portal's address and status, and who has signed in in the last 30 days.
- **Sample data:** the seed now adds a parent login (`parent001@example.org`, with two fictional children) and a teacher login (`teacher1@example.org`, with privileges on Test Class A). Both use the seed password from `.env`.
- **Shared code:**
  - The register screen and the report card are now shared by the office and the portals.
  - Admin, parent and teacher file downloads share one response helper.

**Phase 8 gaps**
- **Student portal** stays on hold, as agreed (FUTURE.md).
- **Student Diary / Daily Progress Tracker** waits for your fields. The "Student Diaries" and "Diary" sections stay hidden.
- **Real payments** are off until you approve them. Stripe and GoCardless haven't been called; the flows are built to their published APIs and tested with fakes.
- **Push notifications to phones** are still on the future list (FUTURE.md). The portals tell people by email, as before.

## 15. Phase 9 record (Ops: §3 Backup, System page, Logs, Email delivery tracking; §19 Calendar feed, Developer API)

**Dependencies added** (on the approved list): `@aws-sdk/client-s3`, for the S3 storage driver. Its tests use a fake client; no real storage service has been called.

**Not used:** `pg_dump` / `pg_restore`. Backups are made by the app itself (see below), so they don't depend on the host's Postgres client version.

**Decisions**
- **Backups (§3)**, under System → Backups (Super only):
  - **What's in a backup:** every table's rows, exported in one consistent snapshot, gzipped, and encrypted with AES-256-GCM using a new `BACKUP_ENCRYPTION_KEY` (they hold children's data).
  - **Where:** in file storage, with a SHA-256 checksum. There's "Full backup now", plus a nightly backup made by the worker after its daily jobs.
  - **Restore:**
    - Needs the school name typed.
    - Refuses a damaged file, or one made with a different version of the database.
    - Then, in one transaction, it replaces all data, resets ID counters and re-checks every link between tables. If anything fails, nothing changes.
    - It signs everyone out. It's audited, with the entry added after the restored audit trail.
  - **Not in a backup:** sign-in sessions, throttles, the backup list itself and worker status.
  - **Uploaded files aren't in the backup:** they stay in file storage (S3 in production).
  - "Delete backups older than 30 days" needs the school name and is audited.
- **Storage:**
  - `STORAGE_DRIVER=s3` stores uploads and backups in any S3-compatible bucket (private, encrypted at rest; the app always serves files itself).
  - Local disk remains for development and the free preview.
  - The variables are documented in `.env.example`.
- **System page (§3):**
  - Version and commit, plus "Automation services" (the worker checks in on every pass; two minutes of silence shows Stopped).
  - The last daily run, the mail queue, whether email and texts are really sent or in test mode, and where files are kept.
  - A setup checklist with links.
  - "Subscription and invoices" and "telephone support" are IBEAMS's own services, which you said to skip.
- **Header/menu theme (§3):** a new Preferences setting: follow each device, Light or Dark. The client's colours never change; this picks light or dark surfaces for the admin area.
- **Logs (§3):**
  - What's logged: sign-ins and wrong passwords (as Staff, Teacher, Parent or Student), set-password links (Teacher, Contact), emails and texts sent or failed (Notification), and daily jobs, backups and failed worker steps (System).
  - "All" also shows the audit trail, which has its own Audit filter.
  - **"Delete all logs" keeps the audit trail**, because it's the school's record of who changed what. It needs the school name and is itself audited.
- **Email delivery tracking (§3):**
  - Every sent email: date, subject, to, sent by, CC/BCC, and a text preview.
  - "Delete sent emails before a date" needs the school name and is audited. Waiting and failed emails stay in the mail queue.
  - **Bounces aren't tracked:** the inventory doesn't ask for it, and it would need the mail provider's webhooks.
- **Calendar feed (§19):**
  - One secret address (`/calendar/<token>.ics`) with holidays shown to parents and active events, to subscribe to in Google, Apple or Outlook.
  - It has no personal data. "Make a new address" stops the old one.
- **Developer API (§19):**
  - Read-only `GET /api/v1/students` and `/api/v1/contacts`, 100 per page, with `Authorization: Bearer <key>`.
  - Keys are created under System → Developer API, shown once, stored hashed, scoped (students, contacts) and revocable.
  - Use is logged and limited to 120 requests a minute per key. Medical notes, notes and other sensitive fields are never returned.
  - The "student diaries" scope waits for the Student Diary.
- **Fixed along the way:** the Logs table can scroll sideways on a phone, so it's now a labelled, keyboard-focusable region (axe caught it).
- **Preview:** `render.yaml` now generates `BACKUP_ENCRYPTION_KEY`. On the free preview, backups and uploads are on the server's disk, so they go with each redeploy. That's fine for a demo, but not for real use.

**Phase 9 gaps**
- **Real hosting** (question 11) waits until the project is complete: a UK-region server and database, plus an S3 bucket set with the variables above. Until then, backups and uploads on the preview don't survive a deploy.
- **Restoring from a backup file kept elsewhere** (uploading one) isn't built: the inventory lists restoring from the list only.

## 16. Changes after Phase 9

- **Sticky notes removed (your request, 24/10/2026).** The inventory lists them (§1, §19), but you asked for them to go. The header button, the notes shown on pages, Tools → Sticky notes and the "Sticky note colours" preference are all gone. The `sticky_note` table and any notes in it are kept, because dropping it would delete data. It can be removed in a later migration if you say so.
- **A real madrasah starts empty (24/10/2026).** The server loads the fictional sample school only when `SEED_SAMPLE_DATA=1`; only the demo preview sets it.
- **First admin: `/admin/setup`.**
  - On a brand-new installation, signing in sends you to the setup page. It asks for the madrasah's name, your name, email and password, and a setup code.
  - The setup code is `SETUP_CODE`, chosen by whoever installs it, so a stranger who finds a new site first can't claim it.
  - Setup makes the school and a Super admin, signs them in, and opens the dashboard with a welcome. Once any admin exists, the page sends people to sign in.
- **Onboarding: "Set up your madrasah"**, modelled on how school systems (and well-run apps generally) do it: school, then year, then classes, then import students with a preview, with a checklist that stays on the dashboard and shows progress.
  - **The first sign-in shows a welcome pop-up** listing the steps, with "Start with step 1" or "Look around first".
  - **The checklist sits at the top of the dashboard** (Super admins only), with a progress bar and one highlighted next step:
    1. Madrasah details.
    2. School year and holidays.
    3. Classes and teachers.
    4. Students and parents (import, or add one by one).
    5. Fees (optional, can be skipped).
    6. Invite parents and teachers (optional, can be skipped).
  - **Steps tick themselves off from real data**, so there's nothing to "mark done", and nothing is lost if someone sets things up another way. Students come 4th because the import puts them into this year's classes, which must exist first.
  - **Every page a step opens shows "Setup step N of 6"** with a way back. The checklist can be hidden ("Hide for now"), and brought back from System. When everything's done, it says so and can be closed.
- **Step 6 fills a gap:** imported parents had no portal login, so they couldn't sign in. "Invite parents and teachers" (on System → Portals):
  - gives every active teacher, and every parent of a current student who has an email, a login;
  - emails those without a password a one-time link to choose one.

  It's safe to run again: people who already have a password aren't emailed. It's audited.
- **The System page's ops checklist is now called "Go-live checklist"**, so it isn't confused with the setup steps.


## 17. Next round (25/10/2026)

- **WhatsApp in place of text messages (your request).** Paid SMS is switched off for now. Communication → WhatsApp picks who (the same groups as texts: current students' primary contacts, chosen classes, teachers, the waiting list, parents without a portal login, all contacts) and a message, optionally from a template, with `{NAME}` filled per person.
  - **Click-to-send, as you chose.** Each person gets a `wa.me` button that opens WhatsApp (the app on a phone, WhatsApp Web on a computer) with the message written. The admin presses send. The system sends nothing and needs no WhatsApp Business account, so no new dependency, cost or third-party data processor.
  - The incident page has "Tell the parents on WhatsApp", using the system incident template. The incident form's "text the primary contacts" box is gone.
  - SMS templates are now "Message templates" and feed WhatsApp. The SMS code, routes and data stay, so texts can come back by unhiding them.
- **Import from any spreadsheet (smart matching now, AI later, as you chose).** Uploading a file whose headings aren't the template's adds a "Match your columns" step. The system guesses from the heading words (for example "Mobile", "Parent name", "DOB" or "Full name", which is split at the last space); the admin checks and corrects the guesses, then sees the usual preview. Matching runs on the server, and only known fields are accepted.
  - Brothers and sisters imported with the same parent email now share one parent record instead of making duplicates.
  - "Moving from another system" (`/admin/import/guide`) explains exporting from IBEAMS, Excel, Google Sheets and paper records, in order: classes, then students.
- **Hidden for later (your request):** text messages, the online payment gateways (Stripe/GoCardless: families pay by cash or bank transfer), the student portal, and the Student Diary. Their Settings tabs, menu items and links are hidden. The routes and data are kept, so nothing is lost. They're listed in FUTURE.md.
- **What's new (`/admin/whats-new`, your request).** Each update gets a plain-language entry in `src/lib/releases.ts` (New / Better / Fixed / Removed), newest first. The dashboard shows "New update" to each admin until they open the page; `admin_staff.seen_release` (migration 0009) remembers this. Updates are installed by whoever hosts the system, so there's no "update" button; the page says which version is running. The System page shows the same version. A new madrasah's first admin starts with the current release marked as seen.
- **The admin on a phone is laid out as an app (your request, 25/10/2026),** following the admin screens in `design-reference/mobile` (Main, AdminStudents, AdminFees). When the screen is 640px or narrower:
  - the sidebar and the sideways-scrolling menu are replaced by a bottom tab bar: Home, Students, Fees (for staff with fees access), Messages (with the unread count) and More;
  - the header shows the school's mark, the page name (on Home, the school and today's date), a search button and notifications;
  - the full menu, the year switcher, the fire drill and "Sign out" move to **More** (`/admin/more`);
  - on the dashboard, the figures sit two to a row, the quick actions form a two-by-two grid, and unread messages and the fire drill come straight after the figures;
  - rows of tool buttons and filter pills scroll sideways instead of wrapping.

  Wider screens are unchanged. Tables keep their columns, which now fit at 390px, so bulk selection still works on a phone.
- **Parent and teacher portals on a computer (your request, 25/10/2026).** On screens wider than 860px, each portal gets a sidebar like the admin's: the school's name, "Parent portal" or "Teacher portal", the main tabs, everything from the More page, the school's links, and Sign out. Pages use the extra width. Phones and tablets keep the bottom tab bar. Both the sidebar and the More page read their items from one list per portal (`menu.ts`), so they always match.
- **Accent colours and flat styling (your choice, 25/10/2026,** from the "Portal accent colours" design). Each app has its own accent from the palette: admin indigo, teacher blue, parent violet; sky is kept for the student portal. They are the tokens `--ra-accent` and `--ra-accent-on-ink`, set on `.rp-teacher` and `.rp-parent`.
  - The accent shows on the logo tile, the current tab (a bar and a pill behind the icon) or sidebar item, progress bars, and the figures on the dark top card.
  - Accent colours are never used as text on white: blue and sky fail contrast. Avatars use the primary blue for the same reason.
  - All gradients are gone: the sidebar, top cards, sign-in background, logo tiles and progress bars are solid colours.
- **Dark mode switch (your request).** Admin has it in the header (and on More on a phone); the portals have it in the sidebar and on their More page. It saves the choice on that device (the `ra_theme` cookie) and applies it before the page paints. Until someone uses it, the school's theme setting (admin) or the device's own setting decides.
- **Dashboard and screen tidy-ups (your requests, 25/10/2026).**
  - **Dashboard layout:**
    - The greeting card no longer mentions fees; it gives today's attendance only.
    - Unread messages and Teacher sign-in now sit above Weekly attendance, which is full width.
    - "Students by age group" (boys and girls) moved to the Students page, under the age-group table.
  - **Hide fees** (on the dashboard's greeting card and the Fees page): for screens other people can see. It's saved on that device (the `ra_hide_fees` cookie). When it's on, the pages leave money out entirely; nothing is just blurred:
    - the Fees outstanding tile, Recent payments and Fees by type on the dashboard;
    - the totals, the monthly chart, totals by type and the payments list on the Fees page.

    Record payment, the fee tools and the fees search stay.
  - **Holiday requests:** two big buttons, Authorise (green) and Unauthorise (red). "Ask for more information" and "Decline" are links underneath. Each one opens a short pop-up with an optional message to the parent, pre-filled for the two main answers.
  - **Portals page:** each portal's address is a link, and there's an "Open … portal" button. The list of who signed in starts closed ("Show who"), so hundreds of parents don't fill the page.
  - **Classes page:** "Switch/rename classes" was removed; a class is renamed on its own edit page. The bulk rename page still exists but isn't linked. "Duplicate class timings" and "Classrooms & subjects" moved into the Timetable page; Subjects is also under Exams.
  - **Classes page:**
    - The filter box and button are now a plain search bar that filters as you type.
    - Each class card opens its class wherever you click on it, with a slight lift on hover. Keyboard users still tab to the class name, and the whole card gets the focus ring.
    - "Change order" (`/admin/classes/order`) sets the custom order with Move up / Move down, and numbers the classes 1, 2, 3. The number field on a class's edit page still works.
  - **Clickable figure tiles:** each dashboard figure opens the page behind it (Students, Register, Fees, Portals, Teacher logs). On the Students page, Current and Waiting list open the student list filtered to that status, and Parents on portal opens Portals. They lift slightly on hover, like the class cards.
  - **Unread messages show a count instead of a dot** on the dashboard and the Messages page: the number of new messages from others in that conversation since you last opened it. A conversation marked unread by hand shows 1.
  - The Students page's "More tools" no longer repeats "Move student classes"; the "Move classes" button is at the top.
  - **Students page "More tools" trimmed (your request):** Download students, Import students and Move student classes repeated the buttons at the top, so they're gone from the row. "Parent portal access" moved to System → Portals, as a "Who sees each child" button on the Parent portal card; the page shows under System → Portals.
  - **Sorting the student list:** the column headings (ID, Name, Gender, Class, Age, Status) sort the whole list on the server, across every page. Pressing the same heading again reverses it. Blanks go last, and Age goes youngest first. The sort is kept while you search, filter or change page.
- **Teachers page and teacher portal access (your requests, 25/10/2026).**
  - The Work days column is gone from the teacher list. The CSV export still includes it.
  - Icon buttons in the teacher and student lists show a short label ("Edit", "Profile", "Working hours"…) on hover and on keyboard focus.
  - **Open their teacher portal** (Super admins only): on the teacher's row and profile. It opens the teacher portal as that teacher in a session marked with the admin (`session.acting_admin_id`, migration 0010).
    - The portal shows a banner on every page, with **Back to admin**, which ends that session.
    - Opening it is audited, and anything done meanwhile is recorded as "Teacher (via Admin)".
    - It needs the teacher to have a portal login (an email on their record) that isn't blocked. A teacher who hasn't chosen a password yet can still be viewed.
- **Register:**
  - Marks are coloured at a glance: present green, late yellow, absences red (authorised, notified and unauthorised are deepening shades). The letters stay.
  - Daily register and Monthly register are two big buttons of their own, apart from the other tools.
- **Teacher logs → Update this week (your request):** a list of teachers, each showing "N of M days logged". Pressing a name opens a pop-up with just that teacher's days (absent, time in, time out, note). Saving closes it and confirms. Saving only touches the days in the pop-up.
- **Fees dashboard → Class fees (your request):** a card on the right lists every class with its full-year fee per student and the structure it uses. Edit opens that structure; for the default structure the button's name says it's shared with other classes. "Set fees" opens the class's fees section if it isn't billed. Hidden along with the other figures when Hide fees is on.
  Pressing a class's name opens **Fees for that class**: Full overview filtered to the students in it now, including anyone not invoiced yet (£0), with the class totals.
- **Fees dashboard figures open their lists (your request):**
  - Invoiced opens the new **All invoices** page (`/admin/fees/invoices`). It lists every invoice this year with filters (student name, type, status, class, due dates), a sort (due date either way, student, amount, balance owed) and totals for what's shown.
  - Received opens All fees received, most recent first.
  - Outstanding opens Outstanding and reminders with everything still to pay.
  - Overdue opens the same page filtered to overdue.
- **Messages (your requests, 25/10/2026).**
  - **Opening a conversation** marks it read, and the page refreshes the header's counts straight away. Previously the count could lag by a page.
  - **Read ticks** (WhatsApp-style): grey means delivered, blue means read.
    - On the office's messages, blue means every parent or teacher on the conversation has read it.
    - On a parent's or teacher's own messages, blue means the other person has read it, or (for a message to the office) any admin has.
  - **Search:** a single search bar with a filter (Everyone, or one teacher or contact) replaces "Advanced search".
  - **Deleting:** admins with Delete access can delete one message (a bin icon on it) or a whole conversation (a button). A conversation left empty goes too. Both ask first and are audited.
  - **Teacher → parent messages:** these count as new for each admin until they open Messages → Teacher ↔ parent. They're added to the Messages badge, and the tab shows how many. Stored per admin in `admin_staff.seen_teacher_parent_at` (migration 0011).
  - **Live counts and sound:** pages ask for the current counts every 20 seconds while the tab is open (`/admin/api/badges`, `/teacher/api/badges`, `/parent/api/badges`). The badges update, and a short chime plays when messages, holiday requests or parent absence/late notices go up.
    - The chime is made in the browser, with no sound file.
    - "Sounds" on/off, per device, is in the admin account menu and on every More page.
  - **Phone notifications** when the app is closed need web push and a new library, so they're waiting on your OK (FUTURE.md 16).
- **Newsletters and WhatsApp left the Communication menu (your request).** Newsletters is on the to-do list (FUTURE.md 15). WhatsApp is now used for reminders where they're needed: a "Remind … on WhatsApp" card with one ready-written message per family (main contacts with a usable mobile) on:
  - Fees → Outstanding and reminders (each family's total owed);
  - a student's Fees page;
  - Register → Attendance alerts;
  - Homework → Incomplete homework;
  - incidents, as before.

  The old WhatsApp page and Message templates still exist but aren't in the menu.
- **Phone notifications (web push): approved 25/10/2026, adding the `web-push` library (3.6.7, with `@types/web-push`).**
  - **Who:** parents and teachers turn them on per device from More (or the "Get notified" card on Home), which asks the phone's permission.
  - **What sends one:**
    - a new message to them (opens that conversation);
    - homework set with "tell the parents" ticked (opens Homework);
    - the school's answer to a holiday request (opens Attendance).
  - **How it's sent:** like email, each notification is queued in the same transaction (`push_queue`) and the worker sends it within about 15 seconds. `push_subscription` holds each device. A device the push service says has gone is forgotten.
  - **Where it sends:** `PUSH_DRIVER=webpush` sends for real (on for the preview); anything else only records it locally (`pushOutbox`, used by the tests).
  - **Keys:** VAPID keys come from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, or the app makes a pair once and stores it, with the private half encrypted. Migrations 0012 and 0013.
  - **Limits:**
    - iPhones only allow notifications for apps added to the home screen (iOS 16.4+); the More page explains how.
    - On the free Render preview the server sleeps when idle, so notifications go out once it's awake.
- **Marketing homepage and early access (your brief, 27/10/2026).** A port of `design-reference/website/`: the homepage, then `/features`, `/faq` and `/contact` (27/10/2026), copy word for word.
  - **Where it shows:** only on the copy that serves the main domain, which sets `MARKETING_SITE=1` (approved). Every madrasah's own copy keeps `/` going to `/admin` and has no `/api/early-access`. Sign-in cookies are scoped to `/admin`, `/teacher` and `/parent`, so `/` can't see who is signed in; nothing in auth changed.
  - **Styles:** `src/styles/marketing.css`, every rule under `.ms`; the reference's colours are `.ms` tokens in `tokens.css`, values unchanged. Light only, as designed.
  - **Font:** the reference's Fraunces has the optical-size axis and the app's doesn't, and both would share the name "Fraunces". So the homepage loads the reference's own file (Fraunces 400, opsz, latin, 35 KB, SIL OFL) with `next/font/local` under its own name (approved). Inter comes from the app as before.
  - **Entrances:** content is visible at rest. Elements already on screen at load never animate; the rest play in just before they scroll into view, so nothing depends on an observer firing.
  - **Sign-ups:** `early_access_signup` (migration 0014, approved), no IP stored. 5 per IP per hour through the existing `rate_limit`. Each one queues an email to `EARLY_ACCESS_NOTIFY_EMAIL`; nothing is sent while `EMAIL_DRIVER=log`.
  - **Avatar contrast (your choice):** in the teacher sign-in mock-up, BK and MA use the darker indigo (`--action`, 5.6:1 with white) and HR has ink text on blue (7:1), instead of the reference's 3.7:1 and 2.2:1.
  - **Offer box contrast (your choice):** its white tint is 10% instead of the reference's 12%, so the text passes 4.5:1 (about 4.6:1, was 4.36:1).
  - **Inner pages:** same rule as the homepage: only with `MARKETING_SITE=1`, a 404 on every madrasah's copy. The FAQ page's `[OFFER]` is the homepage's offer sentence (one constant, `OFFER`).
  - **Contact form:** `POST /api/contact` (`{ name, email, school, topic, message }`), 5 per IP per hour. No new table: each message is emailed to `EARLY_ACCESS_NOTIFY_EMAIL` through the mail queue, which keeps the copy (`./madrasah messages` lists them). With no notify address it answers 503, so the visitor is told to email instead and nothing is lost silently.
  - **Status focus fix:** after a send, focus now moves to the status message once it has rendered. Before, it was focused while still empty and hidden, so focus fell to the page (the homepage form had this too).
- **Owner dashboard, step 1: sign-in and frame (your plan and design, 27/10/2026).** `/owner` on the main site, built from `design-reference/owner/` (plan `OWNER-DASHBOARD.md`, prototype `owner-dashboard-design.html`).
  - **Where it shows:** only with `MARKETING_SITE=1` (reused, approved; no new setting). On every madrasah's copy every `/owner` address, and `/pwa/owner`, is a 404.
  - **Account:** one `login_identity` with the new portal value `owner` (migration 0015, approved). `./madrasah owner <email>` (approved) makes it, or resets it if the phone or password is lost: no password, a new authenticator key, every device signed out, and a one-time setup link for 24 hours (stored hashed in `auth_token`). There is no sign-up route.
  - **Authenticator:** standard TOTP (SHA-1, 6 digits, 30 seconds) on Node's crypto, no package. The key is in `owner_totp` (migration 0015, approved), encrypted with `DATA_ENCRYPTION_KEY`. One step of clock drift is allowed either side, and a code is never accepted twice. No QR code (it would need a package): the key is typed in, or added with an `otpauth://` link on the phone.
  - **Sign-in:** two screens in one form; the second sends the email and password again with the code, and the server checks them together. Wrong passwords and wrong codes share the 5-attempt, 15-minute lockout, and attempts are limited to 10 per address per 15 minutes (existing `rate_limit`).
  - **Session:** its own cookie, `sid_owner`, scoped to `/owner`, lasting 14 days and extended while used (approved). Other portals' sessions don't work here, and this one doesn't work on theirs.
  - **Account page:** change password (12 characters at least; other devices signed out), reset the authenticator, sign out everywhere, where you're signed in. A reset only switches once a code from the new key works, so a half-finished reset can't lock you out.
  - **Audit:** every setup, sign-in, failed attempt and account change is in the main site's audit log, page "Owner".
  - **Styles:** `src/styles/owner.css`, every rule under `.ow`; the teal palette is `.ow` tokens in `tokens.css`, light and dark, values as designed. The prototype is in quirks mode (no doctype), which shortens a few rows; the action rows set their note to a block so they measure the same.
  - **Pages not built yet** (Overview, Madrasahs, Leads, Server, Alerts) show the frame and one card saying what will appear there.
- **Owner dashboard, step 2: Health (approved 27/10/2026).**
  - **Each madrasah's summary:** `GET /api/owner/summary` returns the app version, five counts (current students, teachers, admin staff, parents of current students, and those with a portal login) and when anyone last signed in. Nothing else; a test lists the exact fields and looks for names, emails, phones and addresses in the answer. It is answered only with `OWNER_SUMMARY_TOKEN` (one token shared by every copy, approved), only when every address in `X-Forwarded-For` is private (Caddy puts the visitor's real address there and ignores one they send), and never for the copy's public host name. The main site also keeps only those fields, whatever a copy sends.
  - **Checks:** the main site's worker asks every madrasah every 5 minutes over the private network (`http://ma-<name>:3000`) and keeps each answer in `owner_check` (migration 0016, approved) for 7 days. "Check now" runs a round straight away (6 a minute at most). One missed check is a warning; two in a row is down.
  - **Server health:** `deploy/owner-health` (Python, approved) runs from cron every 5 minutes and writes `owner/health.json`: disk, memory and CPU with 7 days of history, every container, each madrasah's newest backup, and the image's build time. It only reads. The main site's copy has that folder mounted read-only at `/owner`; the website never gets Docker access. Which madrasahs exist comes from this file (the tenant env files, without the main site).
  - **Attention rules:** down, a missed check, no backup, a backup over 26 hours old, an older version, never used, or not used for 14 days; the most urgent one shows. Server disk over 85% or memory over 90% also go in "Needs you". The menu badge counts each madrasah once.
  - **Not yet:** the "New leads" tile (step 4), "This week across all madrasahs" and the fees column (step 3), and the one-madrasah page (step 3), so madrasah names aren't links yet. Madrasahs are shown by their name on the server ("demo", "flc").
- **Owner dashboard, step 3: Usage and money (27/10/2026).**
  - **The summary now also carries:** students by status (current, waiting list, on hold, left this school year), classes this year, sign-ins in the last 7 and 30 days, registers taken this week against the timetable (register-taking slots, minus holidays and closed days), this month's messages, homework and incidents, errors in the last 24 hours (log lines saying "failed" or "error"), the last 8 weeks (students, registers, sign-ins, parent sign-ins, messages), money totals for this month and this school year (invoiced, collected, overdue, families overdue, in pence; a family is the invoice's billing contact, or the student when there is none), and the admin users' name, email, phone and access. The privacy test lists every field and checks that no child's, parent's or teacher's details appear.
  - **Main site:** keeps only those fields. They're optional, so a copy still on an older version shows as "Running an older version" instead of failing its check.
  - **Pages:** each madrasah has a page (`/owner/madrasahs/<name>`) with Health, Usage (with two 8-week charts), Money and Staff contacts (Email, and WhatsApp when there's a phone number). The Overview's "This week across all madrasahs" adds up every madrasah's weeks, and the Madrasahs list has the fees column. Problems in "Needs you" open that madrasah's page. Safe actions and notes come in step 6, so Staff contacts sits in their place for now.
- **Owner dashboard, step 4: Leads (approved 27/10/2026).**
  - **One inbox:** the `lead` table (migration 0017, approved) has a row for every early-access sign-up (its details stay in `early_access_signup`) and every contact-form message (kept in the row; before, it was only in the mail queue). The migration copied the past ones in, unescaping what the notification email had escaped. New ones are added as they arrive; the email notice still goes too.
  - **Status and notes:** New, Contacted, Set up or Not interested, and the owner's notes (saved a second after typing stops, and on leaving the box; 5,000 characters at most). Both are in the audit log, without the notes' text.
  - **"Set up as a madrasah"** only shows the server command, `./madrasah add <name> <name>.<main site's address>`, with a name the command accepts (2–30 lowercase letters, digits or dashes; a placeholder for a name in another script). Nothing is created from the website.
  - **WhatsApp is always greyed out on leads:** neither form asks for a phone number.
  - **Contrast (changed from the design):** the "Contacted" chip's tint is 10%, not 16%, so its text passes 4.5:1 on a selected lead (4.74:1, was 4.42:1).
  - New leads are counted on the Overview tile and the Leads menu badge, and listed in "Needs you".
- **Owner dashboard, step 5: Alerts (approved 27/10/2026).**
  - **What alerts:** a madrasah down (2 missed checks in a row), back up, a backup that's missing, didn't run last night or is over 26 hours old, server disk at 85% or memory at 90%, and each new sign-up or contact message. They're checked after every round (the worker's, and "Check now"); leads alert as they arrive.
  - **Repeats held back:** `owner_alert` (migration 0018, approved) keeps one open row per problem (a unique index on open alerts) until it clears. "Back up" and new leads are news: recorded and cleared at once, so the history shows "—" for when they cleared.
  - **Push** goes to the owner's own devices only, through the portals' push queue and service worker (registered for `/owner`); the history says how each alert went ("Push", "Push and email", "Email", or "Not sent" when that alert is turned off or nothing is set up). **Email** goes to the alert address through the mail queue, so nothing is sent while `EMAIL_DRIVER=log`. A new lead isn't emailed twice to the address that already got its notice.
  - **Settings** (approved): which alerts, and the alert email, in one `setting` row (`owner_alerts`). Every alert is on to start. Changes are in the audit log.
- **Owner dashboard, step 6: Safe actions and notes (approved 27/10/2026).**
  - **Restart and back up now** are rows in `owner_action` (migration 0019, approved). `deploy/owner-actions` (cron every minute, approved) runs only `./madrasah restart <name>` or `./madrasah backup <name>` (new: one madrasah; no name still backs up all), only for a madrasah on the server (never the main site), one run at a time, and records start, finish and result. Values reach psql as variables, never pasted into the SQL. A request waiting less than 10 minutes isn't queued twice; one not picked up within an hour is marked so. The website never gets Docker access.
  - **Set-password link:** the madrasah's own copy makes it through `POST /api/owner/set-password-link` (approved; same private network and token as the summary) for one of its admins, and records it in its own audit log; the main site records it too. Admins couldn't use these links before, so `/admin/set-password/<token>` now redeems one (the middleware lets that path through signed out), but admins still can't ask for one themselves. The main site shows only a link that looks like `https://…/admin/set-password/<token>`.
  - **Notes:** one per madrasah in `owner_madrasah_note` (migration 0019, approved), saved as you type; the audit log notes the change but not the text.
- **Remote support account in every madrasah (your request, 27/10/2026; your choices).** Every madrasah has a super admin, "Madressa Support", so you can sign in and fix what's broken.
  - **The email is set in one place:** `SUPPORT_ADMIN` in `src/lib/support.ts` (blank until you give it; while blank, no account is made). Each madrasah adds or updates the account when its copy starts, so new madrasahs get it straight away and existing ones on the next deploy. A changed email moves the account: the old password and devices stop working. A staff member who already has that email becomes the support account rather than getting a second one.
  - **No password (your choice):** to sign in, use the owner dashboard's "Set-password link" on that madrasah and choose Madressa Support. One leaked password can never open every madrasah.
  - **Visible, but the school can't change it (your choice):** it's in Settings → Admin staff as "Remote support, managed by Madressa", with no edit or delete; the server refuses both too. What it does is in the school's audit log under its name. It doesn't count as one of the school's super admins, so a school can't leave only Madressa in charge, and it doesn't stop a new madrasah's first-time setup.
  - **Which row it is** lives in `setting` (`support_admin`), so no database change was needed. Not on the main site, which isn't a madrasah.
  - **This changes the owner plan,** which listed signing in to a madrasah under "Not included". Schools should be told (privacy notice and data processing agreement) that Madressa can sign in for support.
- **Managing madrasahs from the owner dashboard (your request, approved 28/10/2026).** This changes the owner plan, which listed "creating, suspending or deleting madrasahs from the web" under "Not included".
  - **Same route as restart:** add, pause, resume and remove are rows in `owner_action` (migration 0020, approved: four more actions, plus `address` and `demo` for adds). `deploy/owner-actions` runs `./madrasah add | suspend | resume | remove`, checks every name and address again, never touches the main site, and refreshes the health file straight after. The website still never gets Docker access.
  - **Adding** checks the address points at the server first (otherwise Caddy can't get its certificate). The suggested address is `<name>.<main site's address>`.
  - **Setup code:** asked of the new copy (`GET /api/owner/setup-code`, same private network and token as the summary), only while it has no admin besides the support account. Looking at it is in the audit log; the code isn't.
  - **Pause:** `./madrasah suspend` stops the copy and swaps its Caddy site for a "paused" page (503). A `tenants/<name>.paused` file marks it, so `./madrasah update` leaves it stopped and `owner-health` reports it. Paused copies aren't checked, show as Paused and raise no alerts; their "down" alert is cleared without "responding again" news. Nightly backups take their files from the volume, so they work while stopped.
  - **Remove** needs the name typed and a fresh authenticator code (each code works once). `./madrasah remove` dumps the database, files, env file and passwords into `removed/<name>-<date>/` first and stops if any of it fails. Its open alerts clear once it's gone from the health file. Restoring is by hand, written up in `deploy/README.md`.
- **Website changes from your narrated walkthrough (28/10/2026), previewed first as a video (`screenshots/website-preview`):**
  - **In-page links land mid-screen:** "Start free trial", "See an evening with it" and the topic buttons on Features and FAQ scroll their section to the middle of the screen, or to just under the header when it's taller. The address still shows `#section`.
  - **Gentle snap (your "lock in place", my suggested gentle version):** on laptops and desktops, when you stop scrolling close to a section's resting place, it settles there. Phones and tablets scroll freely, and nothing snaps with reduced motion. A hard lock between every section felt like being trapped.
  - **One evening, pinned:** on screens at least 960 × 640, the evening stays on screen while you scroll. The clock runs 4:45 to 8:00, the chapters take turns, a time bar fills and the sky darkens. Elsewhere, and with reduced motion, it's the stacked chapters as before. The fire drill follows it.
  - **Demos that play themselves while on screen:** in the fire drill, a finger presses and holds, then the live roll call counts everyone out. On the phones, the office clicks through, the teacher marks every child and saves the register, and a parent checks in. They stop when you scroll away and don't play with reduced motion.
  - **Hero:** the heading rises in a line at a time, and Play now works when animations are turned off (it used to do nothing). The dashboard is the same as before (your choice).
  - **Numbers:** every changing number uses equal-width digits, in slots because the heading font has none of its own (your request).
  - **Headings light up word by word as you scroll.** Dimmed words stay at 55%, the lowest that keeps 3:1 contrast for large text (the example reel went much fainter).
  - **The menu's pill** glides to the link under the pointer (mouse and trackpad only).
  - **FAQ:** one card with thin lines and a round + that turns into −. On a white background the card is tinted blue so the box shows (your example link).
  - **Less space:** sections are 3–5.5rem apart (were 4–8rem). The inner pages' top band sits higher, centred, with bigger topic buttons. On Contact, the date is bigger with the Islamic date smaller underneath.
- **Homepage changes (your requests, 27/10/2026), now differing from `design-reference/website`:**
  - **The evening plays by itself:** 4:30 to 8:00 pm in about 14 seconds, a pause at 8:00, a fade, and round again, only while it's on screen. It glides (the slider is `step="any"`; arrow keys still move whole 5-minute steps). It holds while hovered or while the slider has focus, waits 4 seconds after a drag, and a pause/play button next to the time stops it (WCAG 2.2.2 asks for one on anything that moves by itself for over 5 seconds). With reduced motion it doesn't play by itself.
  - **Sits higher:** less space above the hero, and the slider is a frosted panel over the foot of the dashboard (solid when less transparency is asked for), so it's on the first screen on a 1280×720 laptop.
  - **Motion:** the hero's words rise in one after another and the dashboard settles up into place on load; changing numbers roll up, the greeting crossfades, the dashboard fades between loops. Strong ease-out, transform and opacity only, none of it with reduced motion.
  - **The comparison asks instead of assuming:** heading "Paper, spreadsheets and twelve group chats?" (the "Are you using…" versions run to three lines on a laptop), a new intro line, and the middle column is "The question" with a question in each row. The answers are unchanged.
  - **Less space between sections:** `--gap-section` is 4–8rem (was 6–13rem), and headings sit closer to what follows.

## 18. UI polish (approved 29/10/2026)

Twelve changes from the review of your saved UI reels, previewed first (`_ui-preview/index.html`, not committed) and approved together.
- **The dashboard comes alive on open (this changes the DESIGN.md Motion rule, which said no chart-draw animation).** On the first view of a session (the existing `ra_dash_seen` cookie), the KPI figures count up from 0, the Weekly attendance line draws in and the Fees by type bars grow from 0, all within a second. Digits sit in equal-width slots, as on the website. Nothing counts, draws or grows with reduced motion, and no other chart animates.

