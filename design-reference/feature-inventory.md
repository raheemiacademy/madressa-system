<reference name="IBEAMS feature inventory">
## What this is
A complete inventory of the features in IBEAMS (Islamic School Management System by IBEUK), the admin system Raheemi Academy uses at manage.raheemiacademy.online. It was compiled on 17/10/2026 by reading every page in the admin menu, every sub-page linked from them, and every Settings tab.

Treat it as the reference spec for "what an IBEAMS-like school system does". It describes features only. It contains no student, parent or staff data, and none should be added.

Conventions used below:
- Module → page → what you can do there, then the fields (`field_name` where useful) and the options in each dropdown.
- "Year switcher" means the page filters by academic year (2021/22 to the current year). Most pages have one.
- "Portal" means parent, teacher or student portal. Admin settings control what each portal shows.

## How to use it
<task>
Use this inventory as the reference for IBEAMS's features. Do not invent IBEAMS features that aren't listed. If something isn't covered here, say "not in the inventory". Cite the module and page when you refer to a feature.

[YOUR TASK HERE, e.g. "Compare raheemi-system (C:\Users\RA Admin\raheemi-system) against this inventory and produce a gap table: Module | Feature | In raheemi-system? (yes/partial/no) | Notes. Change no code."]
</task>

---

## 1. Dashboard (index.php)
- Global search box in the header (`q`): finds students, contacts and teachers. It's used everywhere as the quick way to reach a student's record.
- Panels: unread messages with a preview and "Read & Reply"; dashboard banners for parent absence notifications ("N parent notifications of absent students today") and pending holiday requests; basic stats; active parents on the parent portal; age-group breakdown; teacher sign-in/out table (Teacher, Signed In, Signed Out, Logged At); IBEAMS news/updates feed with "Auto-refresh daily".
- Header icons: notifications, messages and help. "Switch Year" dropdown for the academic year being viewed.
- Sticky notes can be attached to any page (managed under Tools).

## 2. Fees
Fees Dashboard (fees.php)
- Overdue total; totals by type (Type, Total, Received, Outstanding); recent payments (Payment, Payment Date, Student Name, Amount, Method, Receipt).
- Buttons: Import Fees, Generate Invoices, Monthly Invoices, Full Overview, Modify Invoices, Diagnose Fees/Invoices, View All.
- Fees search: name, surname, DOB, part of address, or `#123` for an invoice ID.
- "Add Fees" (record a payment) modal, available on every fees page.
- Bulk delete of invoices and payments: date range, an option to include payments, student IDs (comma list), and the school name typed to confirm.

Invoice types (used everywhere): Fees, Admission Fees, Contribution, Donation, Products.
Payment statuses: Pending, Cleared, Bounced, Failed, Reversed, Processing.

Per-student fees (fees.php?mode=student-fees&student=ID)
- Totals: Total Due, Total Received, Total Overdue (based on overdue invoices only).
- Invoice View / Report View / Full History; filter by invoice type; Siblings View.
- Each invoice shows its due date, period from–to, amount, payments against it, balance and status (Paid / OVERDUE / Balance). Each has "edit invoice" and "Add Payment".
- Selected payment entries can be marked Complete/Received, marked Pending, or deleted, then "Process". Payments can be moved to another invoice ("Move Here").
- "+Create Manual Invoice", "+Create Ad Hoc Invoices", "View Student Contacts".
- Full History page: the year's totals (invoiced, paid, balance) and "Download PDF Fees History".

Add/modify invoice (fees.php?mode=add-invoice[&edit=ID])
- Fields: type, student, invoice date, amount, description, period from, period to, due date, academic year.
- Billing contact: a dropdown of the student's contacts ("Name (Relation)"), plus contact name, address, postcode and notes. Picking a contact doesn't fill in the name and address by itself.

Query Fees (mode=query)
- Filters: date from/to; past range (last month / 3 / 6 / 12 months); ID or receipt number; type; status; method.
- Order by date received (recent or oldest first), student name A–Z, or amount (low–high or high–low).

Annual Report (mode=annual, annual-students, annual-contacts)
- By Invoices (Inv. ID, St. ID, Student Name, Period/Desc, Due Date, Amount, Received, Balance, Actions); By Students (Invoices, Total, Received, Balance); By Contacts (the same, per contact).
- Filter by type; CSV export.
- "Generate missing invoices now" and "Force Generate Invoices", with options for full year only, force full year, and active students only.

Monthly Fees (mode=monthly): month picker with previous/next; Total Amount, Total Cleared, Total Pending, Total Outstanding; filter by type.

Full Overview (mode=overview): every student with St. ID, Total, Paid, Balance.

All Fees Received (mode=fees): Payment, Date, Student Name, Amount, Method, Receipt.

Direct Debit Stats (mode=direct-debits): payment gateway labels; per student: Class, Direct Debit status, contacts with DD set up. Show All / Who is Active / Who is Inactive.

Bank Transfers (mode=bank-transfers): filter by reference and date range; a list (Student, Invoice ID, Inv. Amount, Received, Date, Status); bulk set to Pending, Cleared, Bounced, Failed, Reversed or Processing.

Send Receipts (mode=fees-receipts)
- Tabs: Unsent / Sent / Manually Sent. Columns: ID, Student, Class, Fees in, Inv., Status, Quick Send.
- "Send as attachment?" option. Send Selected, Send Manually (mark as sent), No Email flag.

Outstanding/Reminders (mode=reminders)
- Overdue / Active / Upcoming / All, filtered by type.
- Filters: minimum amount, month, date range, student or class. Choose which invoices to include ("prepare").
- Option to include a direct-debit setup link. "Edit Email Template". CSV of the overdue total. Proceed to send.

Fees Adjustments (mode=adjustments)
- Per-student standing adjustment: Deduct or Add, an amount, % or £, and a "free" option (no fees).
- Find by student or class. List of students with no adjustment set. Link to Set Sibling Discounts.

Sibling Discounts (mode=sibling-discounts)
- Discount sets: a short title, then one row per sibling position (2nd, 3rd…) with Deduct/Add, an amount and %/£.
- A siblings list with an adjustments check (Surname, Student, Adjustment), and "Assign Adjustments Now".

Combined Sibling Fees (mode=sibling-fees): view family fees together for a parent paying for all their children at once.

Contributions (mode=contributions, contribution-create)
- One-off charges (Contribution, Amount, Total Invoices, Total, Collected, Due Date).
- Create: choose students (all active, waiting list, chosen classes, or search), then set invoice date, description, amount and due date, then "Generate Contribution Invoices".

Fees Structure (mode=structure)
- One structure per class per year, with an annual total shown per class plus a default structure.
- Edit a structure: classes it applies to; fee periods, each with a name (e.g. "4 sessions"), number of invoices, interval (days/weeks/months) and amount.
- Period start: the day it's issued, or the first upcoming Sunday through Saturday.
- Due date: Period Start, Period End, or the 2nd, 3rd, 5th, 7th, 14th or 21st day.
- Helpers: Auto-fill, set due dates to period start or end, Generate Periods Equally, Generate Periods to Month ends, + Add Fees Period.
- Ad hoc structures (Add New Ad Hoc Structure).

Modify Invoices (mode=modify-invoices): bulk editor. "Where current invoices =" amount, due date or period, "Set invoices to" new values, then Preview Modifications.

Import Fees (mode=import): student ID checker; download a customised CSV template (options: unpaid only, all new, due date range, date format); "Columns explained"; upload and preview.

Diagnose Fees/Invoices: a consistency checker for invoices and payments.

## 3. Administration
- Admin Staff (staff.php): name, email (login), password, phone, mobile, rank (Committee, Head Teacher, Head of Education, Administrator, Secretary, Director, Deputy Head, Head Administrator, Head of Day Alim, Head of Hifz, Head of Maktab…), role, allow login, DBS number, issue date and expiry. Access levels: Super (full access), Can Edit, Can Delete, Access Fees Area, Marketing (Newsletter/SMS), Send SMS.
- School Profile: logo (upload or URL), school name, address, city, postcode, school email, no-reply email, BCC copy address, fees receipt sender email and name, tel, fax.
- Academic Year (academic-year.php): years with title, start, end and "current". Year Calendar. Default yearly fees. New Year Wizard (step 1: set the new year; then migrate classes and timings, and migrate students). Yearly Comparison Stats (boys, girls, unspecified, total per year; classes per year). Print.
- Calendar/Holidays (holidays.php): holiday title, description, start and end; visible on the teacher, parent and student portals (separately); whether students attend; whether teachers attend; which classes it applies to. "Send Holidays Newsletter", PDF.
- Backup: Full Backup Now, automatic nightly full backup, list (Date, Backup By, Size, Type), Restore, Delete Backups Older than 30 days.
- Audits (audits.php): key actions logged (Date, Admin, Audit, Page).
- System page: header/menu theme, version, subscription and invoices, mailer and fees scheduler status ("Check Automation Services Status"), mail queue, setup checklist, telephone support (subscription feature).
- Logs: filter by All, System, Parent, Student, Teacher, Staff, Contact, Notification or Audit; Delete All Logs.
- Email delivery tracking: Date, Subject, To, Sent By, CC, BCC, message preview; delete mail logs before a date.

## 4. Settings & Preferences (system.php)
Settings tabs:
- App Settings: Android app PIN.
- Fees Settings: include fee notes on receipts; admission fee amount; create an admission fee invoice when an application form is submitted; bank transfer option (account name, number, sort code, IBAN, SWIFT, payment reference template).
  Reference variables: {CONTACT_ID}, {DATE_YMD}, {DATE_DMY}, {DATE_MDY}, {D}, {M}, {Y}, {STUDENT_IDS} (hyphen-joined), {NUMBER_OF_INVOICES}. Example: MADRASAH-FEES-{DATE_YMD}-S{STUDENT_IDS}.
- Fire/Drills: process attendance without confirmation; email all admins; email class attendance to teachers; fire button in the menu, dashboard or header; let teachers start a drill from the teacher portal.
- FTP: paid storage (1 GB), or your own server (upload script URL, storage limit, test); allowed file extensions list.
- Homework: file extensions teachers may upload; extensions blocked for parents; BCC address.
- Local Settings: timezone; short and long date formats; currency symbol and code; default PDF page size (A4/A5 portrait or landscape, US Letter); Hijri date language (English/Arabic), format codes and offset (−3 to +3 days).
- Mail/SMTP: paid SMTP or private SMTP (host, port, encryption none/SSL/TLS, sender, per-minute limit, username, password).
- Messaging: allow or block each route: Teachers→Admins, Teachers→Primary Contacts, Teachers→Class Students, Teachers→Teachers, Contacts→Admins, Contacts→Teachers (all genders), Contacts→Teachers (same gender only), Students→Admins, Students→Teachers.
- Register: order registers by first name or surname. Register type: classic (present, absent, late, authorised, unauthorised, notified), or DfE attendance codes (code, description, type, keys, late). Code types: Present, Approved educational activity, Authorised absence, Unauthorised absence, Not counted.
- Spell Checker: GrammarBot host and key.
- Parent Portal: URL; login background; social links (website, email, Twitter, Facebook, Instagram, LinkedIn, WhatsApp); custom links with icons; disable the portal with a message; walk-home consent; force direct-debit setup; force parents to confirm student details.
  Hide sections: Fees, Attendance, Term Reports, Exam Results, Student Diaries, Homework, Events, Incidents, Holiday Requests, Merits, Products, Files. Access control by contact type.
- Student Portal: URL and custom links.
- Teacher Portal: URL; login background video; custom links; quick log-in/out time adjustment; show parent contact details; show student personal details (DOB, email, mobile, address, siblings); show custom fields; teachers can start a fire drill.
  Hide sections: Registers, Diary, Teacher Logs, Forums, Merits, Homework, Incidents, Exams, Progressive Tests, EOTY Reports, Events, Docs & Files, Holiday Requests.

Other settings pages:
- Preferences: logo in side menu; HTML5 date picker; teacher logs on the dashboard; students per list page; photo timeout; photos in search results; sticky note colours; email notification for portal messages; IBEAMS newsletter subscription.
- Year & Age Groups: year-group labels with minimum and maximum ages; classes are assigned to a year group.
- Custom Fields: for Students, Teachers, Admin Staff or Contacts. Each has a label, title or question, type (Text, Multiline, Number, Decimal, Date, Time, Radio options, Multiple-choice checkboxes), length or decimals, option values, whether it's searchable, who it's for, and whether it shows on the registration page.
- Payment Gateways: GoCardless (direct debit), Stripe, PayFast; force direct-debit setup; compare rates.

## 5. School: Students, Contacts, Teachers, Classes
Students hub (students.php)
- Counts for current and waiting list by age.
- Links: Manage Students, Move Student Classes, Parent Portal Access, Download Students, Walk Home Consents, Add Student, Import Students, Export/Import Edit, Public and Adult Registration Pages, Manage Siblings, Manage Contacts, Data update PDFs, Find Duplicate Students, Multiple Class Students.

Manage Students (mode=students)
- Searchable, paged list (#, gender, name, class, DOB with age-group info, status, actions).
- Filters: class (including "No Class Designated"), status, left date range, start date range, medical only.
- Row actions: Edit, Profile, Register, Incidents, Fees, Fees History, Class History, Portal Login (needs a student email), Delete.
- Bulk actions: create admission fees, move to Accepted, move to class and activate (with a date), move to Rejected, permanently delete; set status and left date.
- Statuses: Waiting List, Current, Relocated/Left, Suspended, Expelled, Finished, On Hold, Accepted, Deceased, Rejected.

Add/Edit Student (mode=student-edit)
- Class (or "No Class (Waiting List)"); create admission fee; name, surname, DOB, gender (Male, Female, Unspecified); student login email and password; tel, mobile, mobile 2; address, postcode; status; start date; finish (left) date.
- When marking someone left, optional actions: delete unpaid invoices, delete register entries, send a "student left" email.
- Medical notes, general notes, custom fields.
- Contacts on the form: add an existing or a new contact (name, email, tel, mobile, alt mobile); type (Parent, Sibling, Emergency, Other); relation; primary or not; whether they can see the child on the parent portal.

Student profile (mode=student&student=ID)
- Status, ID, class, photo, attachments.
- Contacts (with Manage Contacts), Fees summary (Invoice, Period, Amount, Paid, Balance), Merits, Certificates, Incident reports.
- Student notes: save, edit, and export as PDF.

Class history (mode=class-assignments): From, To, Class, Year. Add a class to history, move to a new class, assign the current class.

Attendance record (register.php?mode=student-record): see Register.

Parent Portal Access (mode=parent-portal-contacts)
- Global settings, then every student with their contacts. Block or unblock each contact, make primary or non-primary, add an email.

Siblings (mode=siblings)
- Registered sibling relations; find by surname; "Automatically find siblings"; Quick Check; add manually; include non-current students.
- Links to sibling discounts, combined fees and sibling fees.

Walk Home Consents: per class, consents given by parents on the portal; add a consent by hand; CSV.

Data update forms (mode=data-form): printable PDFs of each student's data for parents to check, by class, with a message.

Import Students and Import Contacts: download a customised CSV template, fill it in, upload. Export/Import Edit lets you bulk-edit existing records by CSV.

Registration pages
- Public student application form, hosted by IBEUK or embedded on your site (embed code or WordPress plugin).
- Settings: enable; require DOB, mobile, address, or an emergency contact; copy the parent's surname to the child automatically; schedule the form on or off by date and time; header and footer text; layout theme (classic or new).
- Application groups (e.g. "Boys & Girls Maktab (4+)"): name, order, enabled or disabled, a description for parents, required or optional, multiple choice. Custom fields can appear on the form.
- Adult application form: the same without parent details.
- Applications arrive as Waiting List students.

Contacts (mode=contacts; contacts.php)
- Total count; groups (e.g. parents); list (#, Name, DD/Telephone, Mobiles, Actions); view, edit, and portal login.
- Contact fields: groups (or a new group), name, tel, mobile, alt mobile, email, address, postcode, active status, portal password reset or set.
- Contact page: the students linked to them, with type, relation, primary and block-portal settings; assign a student; "Set student address to this"; Sync.
- Tools: import; export/import update; check email conflicts; check mobile conflicts; multiple contact assignments (unassign duplicates); students with no contacts; contacts with no students; mass-assign contacts (relation, type, primary, block portal); portal access overview; block by contact type; view contact students.

Teachers (teachers.php)
- List (#, Name, Work Days, Status); PDF and CSV; import; delete several at once.
- Teacher fields: full name, DOB, gender, email, portal password, kiosk PIN, tel, mobile, status (Inactive, Employed, Suspended, Dismissed, Resigned, Retired, Volunteer), start and left dates, photo, address, NI number, DBS number, issue and expiry, emergency contacts, medical info, bank account name, number and sort code.
- Row actions: Edit, Work Hours, Profile, Portal, Delete.
- Working hours (mode=working-hours): a weekly grid per teacher (start and finish per day); bulk change or add times for chosen days.

Classes (classes.php)
- Cards per class: year group, number of students, main teacher, fee per year, start and end dates. Order by teacher gender, name, size or a custom order. Quick filter.
- Add/Edit Class: name, age group, main teacher, year start and end, own fees or the default structure.
  Timetable: apply a template, or add timings per day (teacher, start time, hours and minutes, room, subject, whether it takes a register).
- Class Teachers (mode=teachers): several teachers per class, with portal privileges each: register, EOTY reports, messaging, merits, homework, incidents.
- Classrooms & locations.
- Timetable (mode=timetable): a week grid per class; timetable templates; assign templates to classes.
- Manage class students (add or remove); Move Students; Switch/Rename Classes; Duplicate Class Timings; School Days.
- Maintenance: Fix Count, Fix Class History, Fix Student Classes.
- PDFs: Basic Class Summary, Full Class Summary, All Classes. Import classes in bulk (CSV, Excel, paste, or quick add one per line, with a default age group, teacher and template).

## 6. Register (attendance)
Register Dashboard (register.php)
- Query Daily Register (Yesterday / Today / 7 Days): shows each class's register as complete or incomplete.
- Query Student Attendance (search a student).
- Mark Students Absent: search a student, then a date range, specific weekdays, notes/reason, notified, authorised or unauthorised, then "Complete Registers".
- Delete register entries: date range, class or students, school name typed to confirm.
- Links: Daily Register, Attendance Stats, Absent Calendar, Download Register, Mass Authorise, Daily Sessions Attendance, Attendance Alerts, Double Entries.

Daily Register (mode=daily, daily-view)
- Pick a class and month, with month buttons for the year. View Mode or Entry Mode.
- A grid of students × days. Each cell shows present, late, absent, left early, closed or holiday, with icons for authorised, unauthorised and notified.
- Clicking an absence opens a menu: Note/Reason, Authorised, Unauthorised, Cancel.
- "Multiple Validations" panel: every unvalidated absence and late for the month (student, date, absent or late, minutes late, Note/Reason). Percentage per student.

Monthly Register (mode=monthly): a monthly view per class.

Student attendance record (mode=student-record&student=ID)
- Per month: sessions, absent (authorised/unauthorised), late, minutes, left early, strict % and standard %.
- A 12-month chart (stacked or not; bars, lines or steps).
- Daily monitor: each day with time, status, authorisation ("Authorisation unspecified" plus an Add link), and the note. Date-range view.
- Totals: present, absent, absent authorised or unauthorised, late, late minutes, left-early minutes, minutes missed, late authorised or unauthorised, notified.

Absent Calendar: per day, the authorised absences, unauthorised absences and unauthorised lates, by class (Class, Absence, Lates, Punctuality). Filter by class; previous and next month.

Holiday Requests (from parents on the portal)
- Ref, Request From, Dates, Request, Response, Status.
- Actions: Edit, Accept (as authorised or unauthorised), Request Info, Decline, Delete, with a response text.

Parent absence notifications (mode=parent-absent-notifications): "will be absent today" and "will be late today" notices sent from the portal, shown as dashboard banners.

Attendance Stats (mode=attendance)
- By month or date range and class. Filter above or below a percentage.
- Student, Class, Entries, Present, Absent, Late, Percent, Percent (Strict), Quality. CSV. Daily Present Stats.

Mass Authorise (mode=authorise): recent days listed; tick entries, then add notes, Authorise or Unauthorise, and set notified.

Daily Summary and Daily Present: a summary of a chosen date.

Attendance Alerts (mode=alerts): an attendance threshold %, absent and late counts and an interval trigger alert emails. Templates: attendance report email, high attendance email.

Download Register: blank register PDF by month; daily or monthly register PDF by class, month and year, ordered by first name, surname or DOB.

Double Entries: find students with duplicate entries; "Delete Duplicate Entries & Fix SQL Table".

## 7. Teacher Logs (staff attendance)
- Dashboard: weekly summary of each teacher's logs, with a week picker.
- Add logs: generate a form for chosen teachers and a date range (prefill option), or import a CSV.
- View weekly logs: absent flag, time in, time out; update.
- Pending logs; Absentees (a monthly calendar); Print (PDF by date range and teachers).
- Teachers log in and out from the teacher portal, the app or a kiosk PIN.

## 8. Events/Trips (events.php)
- Upcoming and previous events (S., Date, Time, Event, Price, Timeslots, Auto-Invoice).
- Add event: name, date, time, duration (days, hours, minutes), opt-in deadline, payment deadline, description, terms, group students.
- Timeslots: dates, from, to, interval, or session timings.
- Consent items (each required or optional) and itemised pricing (description and price).
- Auto-invoice on opt-in; active status. Parents opt in on the portal.

## 9. Incidents
- Recent incidents for students, teachers and staff (counts for each); filter by student or class; list mode.
- Add incident: who it involves (a class then a student, or *TEACHERS* / *STAFF*); template; severity; date and time; title; report; action taken.
  Options: include in the end-of-year report; show on the parent portal; email the primary contacts; SMS the primary contacts.
- Templates: severity, title, report, action, EOTY and portal defaults.
- Reports (Health & Safety): download incidents as PDF or CSV by date range; 12-month incident record.

## 10. Messages (messages.php)
- Inbox, Locked (Archived), Other (teacher↔contact and teacher↔student messages for oversight, filtered by teacher). Filters: All, Teachers, Contacts, Admins.
- Compose: recipients can be teachers, staff, contacts (search, or pick a class) or students; for-attention-of (all admins or a rank); subject; message; attachment. Send, or Send & Lock.
- Thread view: replies; "Reply & Lock" (locking stops parents and teachers replying, and clears it from unread); read status per reply ("not yet read").
- Advanced search: by contact, teacher or student. Bulk: mark read or unread, archive, delete. Delete several messages by date range and sender or recipient.

## 11. Newsletters / SMS
- Newsletters: list (Created, Subject, Target, Last Sent).
  Create: from email, subject, audience (parents or contacts, teachers, admins for testing, student emails, specific classes), template (Modern, IBE New, IBE Classic, Dark Theme, Plain), signature. Then compose and send.
- Attachments/Image Manager: upload images and files for newsletters.
- SMS: three provider options (one-click/app, ClickSend API, VoodooSMS API); sender ID; country code.
  Send SMS: to a group (admin staff, active teachers, current students' primary contacts or all contacts, waiting-list primary contacts, left students' primary contacts, inactive portal contacts, unassigned contacts, chosen classes) or a search; templates; CSV upload; queue for sending.
  SMS Templates: categories (Attendance, System, custom); system templates (2-factor, Absence Notify, Fees Reminder, Homework, Incident, Late Notify) with variables.
  SMS Logs: filter by date, staff, recipient type or search. SMS credits.

## 12. Student Diary / Daily Progress Tracker (paid add-on, not on the current subscription)
- Diary dashboard, syllabuses, syllabus assignments to students, subjects. Parents see diaries on the portal. Inner pages weren't visible, so the field-level detail is unknown.

## 13. Homework
- List (Homework, Teacher/Class, Completed, Files, Status); filter by class, date range, active or inactive; templates; activate or deactivate; lock or unlock; upload a file; delete.
- Add homework: class, teacher, specific students (or the whole class), title, deadline date and time, lock after the deadline, allow uploads, notify contacts, instructions.
- Incomplete report: send reminder emails (with a test send). Year report: per student (Total, Completed, Incomplete, %), then email contacts.
- File storage: available, used and remaining space; free, paid, own-server or local FTP storage.

## 14. Forums
- Categories (Order, Category, Description, Classes): name, description, the classes that can see it, or combined classes. Teachers and parents post in the portals.

## 15. Exams / Tests
- Exams list: Open, Closed, Locked; Official Exams or Progressive Tests; added by teachers or by admins; all years. Filter by class or teacher. PDFs.
- Add exam: class, type (Official Exam, used on reports, or Progressive Test), title, date, year. Then "edit tests" (the subject papers) and "results" (enter marks).
- Semesters: combine several exams into one result set (title, classes, linked EOTY report).
- Quizzes (beta): subject, title, start and end date and time, teacher, classes, status.
- Subjects: name and description; also used for timetables and diaries.
- Grades: grading systems (name, then rows of percentage → grade); load the IBEAMS defaults.

## 16. EOTY (End-of-Term/Year) Reports
- Reports list (#, Report Title, Year, Settings, Status).
- Create or edit: name, term start and end, year; include exam results (with or without class position), attendance and homework; custom scoring questions and score labels (or disable scoring); active; let teachers download and preview.
- Teachers write comments in the teacher portal. Pages: All Comments, Overview, Generate Reports (PDF).
- Paragraph templates for Behaviour, Progress and Effort (five levels each), with score variables, any language, and backup and restore of the defaults.

## 17. Products (shop)
- Inventory: image, name, description, price, original price, price in merits, stock, sold, active.
- Sales: Date, Contact, Student, Class, Total, Item, Qty; mark delivered. Merit purchases (students spend merits).
- Create sale: contact or student or class, then product.

## 18. Merits / Achievements
- Merits: name, description, points, for students and/or teachers, enabled, official. "Award Merits Now" to a list of students.
- Achievements/Sanctions: milestones reached by collecting given merits or points. Each has a certificate template, a badge (none, bronze, silver, gold), points target, who it's for, and enabled.
- Merits awarded: filter by class, teacher, merit or dates (#, Date, To, Merit, Class, Comment, Added by, Points); delete. Totals per student.
- Certificates: issue one to a student (template, badge, "for" text, date, show on portal). Certificate templates are made by uploading a PDF and positioning the name, achievement, badge and address (size A4, A5 or A6; orientation).
- Merit Teams (houses): team name and member classes or students. Team Competitions: name, start and end dates.

## 19. Tools
- Custom PDF/CSV downloads: student lists with extra columns (contacts, primary only, class, teacher, medical only), filtered by application group, gender, class, status; ordered by name, surname, age, class or start date; landscape, split by class, full format. Also student data backups, incident downloads, and monthly report files.
- Portals: links and status for the parent, teacher and student portals. Parent and teacher portals can be hosted by IBEUK or on your own site (download a single file). See who is active.
- Sticky Notes: every note added to pages, with "go to page".
- Mail Queue Manager: queued emails (Date/Time, To, From, Subject, CC, BCC, Attachments); Send Now, Delete.
- Templates Editor: editable email/PDF templates in groups: Administration, Certificates, End of Year Reports, Fees, Homework, Incidents, Messaging, Portals, Registers, Registration Page, Reports, Student. Template versions (duplicate and edit, e.g. "Urgent"); Hijri date variable.
- Calendar (ICS) feed. Mobile/tablet app (app.ibeuk.org). Developer API (students, contacts, student diaries). Free services. WordPress plugin.
- Fire Drill: "INITIATE FIRE/DRILL NOW" produces instant attendance lists; history (Date, Initiated By).
- Help & Support: help guides, contact or raise a ticket, feature requests, remote support (grant access for a set time), rate us.

## 20. Portals (what users outside the office get)
- Parent portal: log in by the email on the child's contact record, then create a password. Parents can see and do the following, and admins can hide any of it: fees and payments (pay by Stripe or GoCardless direct debit, bank transfer details), attendance, absence and late notices, holiday requests, term reports, exam results, diaries, homework (upload files), events (opt in, consent, pay), incidents, merits, products (buy), files, messages to admins or teachers, walk-home consent, confirming student details.
- Teacher portal: registers (take attendance), class lists and student profiles (optionally with contacts and personal details), messaging, merits, homework, incidents, exams and progressive tests, EOTY report comments, diary, forums, events, files, holiday requests, own log in/out, fire drill. Admins can hide each section and set per-class privileges.
- Student portal: login by student email; custom links; messaging if allowed (Students→Admins/Teachers settings). Other sections weren't visible from the admin side, so they're unconfirmed.
</reference>
