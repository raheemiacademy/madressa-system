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

7. **Text messages (SMS)** (§11)
   Replaced by WhatsApp click-to-send for now. The SMS code, settings and templates are kept and hidden. To bring them back: pick a UK SMS provider, add its keys, and unhide the SMS settings tab and menu.

8. **Automatic WhatsApp** (§11)
   Sending from the system without a person pressing send. This needs a WhatsApp Business (Cloud API) account, approved message templates and per-message fees.

9. **Online payments** (§4, §6)
   Stripe card payments and GoCardless direct debit are built but hidden; families pay by cash or bank transfer. To turn them on, you need live accounts, real keys and webhooks, and to unhide the Payment Gateways tab.

10. **AI import conversion** (§2)
    Turning any file (PDF, photo of a register, a messy Word list) into the import CSV with AI. For now, smart column matching handles spreadsheets in any layout. This needs an AI provider, and children's data would go to a processor, so the data protection terms must cover it.

11. **Email per madrasah from your domain** (§4 Mail)
    For example raheemiacademy@yourdomain.org. This needs a transactional email service with UK/EU data and your domain verified (SPF, DKIM, DMARC). Each madrasah's "From" is its own address, and Reply-To is its office.

12. **Bounce and complaint tracking** (§3)
    Updating email delivery records from the email service's webhooks once a real provider is chosen.

13. **Restore from an uploaded backup file** (§3)
    Today, restore works from backups listed on the server.

14. **Ideas to consider**
    - A practice copy with sample data that a new madrasah can try before going live.
    - A parent welcome pack: a printable letter with a QR code to install the parent app.
    - A "go-live day" checklist.
    - Direct import from an IBEAMS export.
    - A data-protection pack for each madrasah (privacy notice and DPA templates).
    - Hosting several madrasahs on one installation.
    - Choosing the product's name and branding.

15. **Newsletters** (§11, your request 25/10/2026)
    Built, but taken out of the menu for now: Communication has Messages and Shared files. The pages and data are kept (`/admin/newsletters`), so it can come back by adding the menu item.

16. **Billing the madrasahs: remind you when early access ends** (your request 27/10/2026)
    For the owner dashboard: a simple record per madrasah (plan, price per month, start date, paid-up-to date, notes; payments marked by you, no online payments). Not built during early access. **When early access is ending, bring this up** so it's ready before the first school pays.

17. **"New version available" with an Update button for each madrasah** (your request 28/10/2026)
    When you ship a new version, each madrasah's admin dashboard shows "New version available: see what's new and update". It opens a pop-up listing the new features, with a big **Update** button; the update takes a few seconds and the page reloads on the new version. One update covers that whole madrasah: its admin, teacher and parent portals are the same copy, so they all move together.
    - **How it would work:** shipping builds the new version on the server but no longer restarts everyone. Pressing Update queues it for that madrasah (the same request queue the owner dashboard uses), and the server starts the new version next to the old one, switches over once it answers, then stops the old one, so nobody goes offline ("blue/green").
    - **To decide when building:** whether you can still push an urgent security fix to everyone without waiting for them to press Update, and whether a madrasah that never updates gets updated anyway after a while. Database changes must keep working on both versions during the switch.
    - The owner dashboard already shows which madrasahs are "Running an older version".

## Waiting on your details

- **Student Diary / Daily Progress Tracker** (§12): its inner pages weren't visible in the inventory. Send the fields you want and it will be built.
