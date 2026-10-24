# Future to-do list

Things deliberately left out of the current build, kept so nothing is forgotten. Ask for "the future to-do list" to see it.

## Skipped for now

1. **PayFast payment gateway** (inventory §4 Payment Gateways)
   A third online payment option next to Stripe and GoCardless. Skipped because it's a South African gateway and the school uses UK payments.

2. **Spell checker (GrammarBot)** (§4)
   Checks spelling in reports and messages through the GrammarBot service. It needs an outside account and key. Its settings tab was removed until it's wanted.

3. **The school's own versions of the IBEAMS services** (§1, §3, §4, §19)
   You plan to build your own later:
   - a news and updates feed on the dashboard;
   - a newsletter subscription preference;
   - a System page with subscription, invoices and telephone support;
   - Help & Support (tickets, remote support, "rate us");
   - a mobile/tablet app and an Android app PIN;
   - a WordPress plugin for the application form;
   - "free services";
   - portals hosted as a single downloadable file;
   - paid FTP storage or an upload script on your own server.

4. **Student portal** (§20)
   Students signing in to see custom links and messages, plus the sections the inventory couldn't confirm. That includes messaging students and the Students → Admins / Students → Teachers routes. Not built now. The `/student` login page, student login emails on the student form and the Student portal settings tab from Phases 1–2 are already there for when it's picked up.

5. **Fire drill phone alerts** (§19)
   Push notifications to teachers' phones when a drill starts. For now, drills alert by email only. This needs web push, which is a new dependency.

6. **Real hosting** (DECISIONS question 11)
   Move off the free Render preview once the project is complete:
   - a UK-region server for the app and its background worker;
   - a paid Postgres database with backups;
   - S3-compatible file storage, so uploads survive deploys;
   - the school's own domain.

## Waiting on your details

- **Student Diary / Daily Progress Tracker** (§12): its inner pages weren't visible in the inventory. Send the fields you want and it will be built.
