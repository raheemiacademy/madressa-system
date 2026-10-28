# Owner dashboard: plan

A private dashboard for you alone, to oversee every madrasah copy on the server. Nothing here is built yet. This is the plan to agree before building.

## Your choices

| | Choice |
|---|---|
| Where | On the main site at **`/owner`**, e.g. https://213-32-71-244.sslip.io/owner (later yourdomain.com/owner) |
| Sign-in | Your own login: password **plus a 6-digit code** from an authenticator app. Only one account exists, and nobody can sign up. |
| What you can see | **Counts and staff contacts.** Numbers for each madrasah, plus its admins' names, emails and phones. **No children's or parents' names or details.** |
| What you can do | **See everything, plus a few safe actions,** and (added 28/10/2026, your request) **add, pause, resume and remove madrasahs.** |
| Sections | Health, Usage, Leads, Money |
| Alerts | **Phone push**, **email**, and **new-lead alerts** |
| Billing | Not now. It's in FUTURE.md (item 16), with a reminder for when early access ends. |
| Devices | **Phone and laptop equally**: cards on a phone, full tables on a laptop |
| Look | The admin app's design, in a **deep teal** palette so it never looks like a school's admin |

## Pages

### 1. Overview (the home screen)
- **Status strip:** "All 3 madrasahs running" in green, or "1 needs attention" in amber or red, which takes you to the problem.
- **Cards:**
  - madrasahs up out of the total;
  - new leads waiting;
  - last night's backups (all OK, or which failed);
  - server disk and memory.
- **Needs you:** a short list with the newest first, for example:
  - flc hasn't been used for 14 days;
  - a new contact message;
  - demo's backup is 30 hours old.
- **This week across all madrasahs:**
  - students;
  - registers taken;
  - parent logins;
  - messages sent.

### 2. Madrasahs (the list)
- One row (laptop) or card (phone) per copy:
  - name, web address, status dot, version;
  - students, teachers, parents with logins;
  - last active, last backup;
  - this month's fees collected against invoiced.
- Sort and filter by: needs attention, least active, or biggest.
- **Add madrasah** (added 28/10/2026): a short name, a web address (yours, or `<name>.<main site's address>`), and real or demo. The address must already point at the server. The server sets it up within a minute or two; "Changes today" shows how each add, pause, resume and removal is getting on.

### 3. One madrasah (detail)
- **Health:**
  - up or down, and how long it's been up;
  - app version;
  - last backup, with its size;
  - memory use;
  - errors in the last 24 hours.
- **Usage:**
  - students by status;
  - classes;
  - teachers and staff;
  - parents with a login;
  - logins in the last 7 and 30 days;
  - registers taken this week compared with the timetable;
  - messages, homework and incidents counted, not shown.
  - Small 8-week trend charts.
- **Money:** this month and this year, all totals only:
  - invoiced;
  - collected;
  - overdue;
  - number of families with overdue invoices.
- **Staff contacts:** the madrasah's admin users (name, email, phone, access level), with WhatsApp and email buttons.
- **Safe actions:** each asks you to confirm and is recorded in an audit log.
  - **Copy a set-password link** for one of its admins (for a locked-out head teacher). The madrasah's own audit log records it as well.
  - **Restart** the copy.
- **Manage** (added 28/10/2026), each asking first and recorded in the audit log:
  - **Setup code** for its first admin, asked of the madrasah's own copy, only until that admin exists.
  - **Pause / resume:** a paused copy is stopped and visitors see a "paused" page; nothing is deleted. It shows as Paused, isn't checked and raises no alerts.
  - **Remove:** needs the madrasah's name typed and a fresh authenticator code. The server keeps a final backup of its database, files and keys in `/srv/madrasah/removed/` before deleting anything.
  - **Back up now.**
- **Notes:** your own notes about the madrasah, such as "Imam prefers WhatsApp" or "go-live 01/12".

### 4. Leads (one inbox)
- Early-access sign-ups and contact-form messages together, newest first.
- **Status** on each lead: New → Contacted → Set up → Not interested. You can add notes to each lead.
- **One-tap buttons:** reply by email, open WhatsApp, or "Set up as a madrasah". That last one shows the exact server command to run; it doesn't create anything itself.

### 5. Server
- Disk, memory and CPU (now and over 7 days).
- Every container's state.
- **Backups:** the size and age of each madrasah's backups, and whether last night's ran.
- Version deployed and when.
- (Off-server backup status, once that's set up.)

### 6. Alerts
- A history of every alert sent and when it cleared.
- **Settings:**
  - turn push on for this phone or laptop;
  - choose which alerts to receive;
  - the alert email address.

### 7. Account
- Change password.
- Reset the authenticator.
- Sign out everywhere.
- See where you're signed in.

## Alerts

| When | Push | Email |
|---|---|---|
| A madrasah doesn't respond for 2 checks in a row (about 10 minutes) | ✓ | ✓ |
| It comes back | ✓ | ✓ |
| A backup failed, or the newest one is over 26 hours old | ✓ | ✓ |
| Server disk over 85%, or memory over 90% | ✓ | ✓ |
| New early-access sign-up | ✓ | ✓ |
| New contact message | ✓ | ✓ |

- Repeats are held back: one alert per problem until it clears.
- Email goes nowhere until a real email service is connected. Until then, push is what reaches you.

## The look
- Same layout, components and accessibility rules as the admin app (DESIGN.md), in light and dark mode.
- **Deep teal palette:**
  - sidebar `#0F4C4A`;
  - buttons and links `#13807A`;
  - amber `#E0A526` for warnings;
  - warm off-white `#F6F4EF` background.
- **Dark mode:** background `#0B1F1E`, buttons `#2BB3A8`.
- All text at least 4.5:1 contrast, which I'll check and adjust if needed.
- A clear **"Owner"** label beside the logo.
- **Phone:** bottom tab bar (Overview, Madrasahs, Leads, Alerts). It can be added to the home screen like the portals.
- **Laptop:** sidebar and full tables.

## How it works (technical)
- **The main site collects everything.** Each madrasah has its own database, and the main site never gets direct access to them.
- **Asking the madrasahs:** each madrasah copy gets a small private endpoint, `GET /api/owner/summary`. It is reachable only inside the server's private network (not through the public web address) and needs a secret token. It returns the counts, money totals and admin contacts listed above, and nothing more.
- **Checks:** the main site asks every 5 minutes and keeps the results, so trends and "last active" work.
- **Server health:** a small script on the server writes disk, memory, containers and backup ages to a file every 5 minutes. The dashboard reads that file.
- **Safe actions:**
  - Restart and back up now go through a short request queue that the server script checks every minute. The website never gets control of Docker.
  - Adding, pausing, resuming and removing use the same queue (`./madrasah add | suspend | resume | remove`), never for the main site; the script checks every name and address again.
  - The setup code is asked of the new madrasah's copy through the same private network and token (`GET /api/owner/setup-code`).
  - The set-password link is asked of the madrasah's own copy through the private endpoint.
- **Sign-in:** a separate "owner" login with its own cookie that only `/owner` sees.
  - The authenticator code is standard (TOTP) and built with what Node already has, so no new add-ons.
  - You add it to your app by typing in a key, or tapping a link on your phone. A scannable QR code would need an add-on, so I'd ask first.
- **Your account:** created once with a server command (`./madrasah owner`), which prints a one-time setup link.
- **Where it runs:** only on the main-site copy, behind a setting like `MARKETING_SITE`. On every madrasah's own copy, `/owner` doesn't exist.
- **Audit:** every sign-in and action is logged in the main site's audit log. The set-password link is also logged in that madrasah's own log.

## What needs your OK when building

| Item | What it involves |
|---|---|
| New database tables on the main site (I'll show the schema first) | the owner account; lead status and notes; stored check results; alerts; madrasah notes |
| A database change | add an "owner" sign-in type |
| A new server script and cron entry | health file and action queue |
| New settings in each madrasah's env file | the private token |
| A change to `./madrasah add` | also give each new copy its token |
| No new add-ons planned | the only exception is the optional QR code |

## Not included
- Looking inside a madrasah's records, or signing in as them.
- ~~Creating, suspending or deleting madrasahs from the web.~~ Added on 28/10/2026 at your request (see "Manage" above).
- Billing the madrasahs (FUTURE.md item 16).
- Children's or parents' details of any kind.

## Build order
1. **Sign-in and frame:** owner account, password and authenticator code, the teal layout, empty pages.
2. **Health:** the server script, the madrasahs' private summary endpoint, the Overview, Madrasahs and Server pages.
3. **Usage and money:** the remaining numbers, trend charts and the one-madrasah page.
4. **Leads:** the inbox with statuses and notes; sign-ups and messages move into it.
5. **Alerts:** push and email, settings and history.
6. **Safe actions:** restart, back up now, admin set-password link, notes.

Each step ends with tests and screenshots at phone, tablet and laptop widths in light and dark, before the next one starts.
