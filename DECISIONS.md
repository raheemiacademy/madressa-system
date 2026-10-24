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
