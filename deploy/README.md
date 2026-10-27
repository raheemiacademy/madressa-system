# Running test madrasahs on the VPS

One server (OVH VPS-1, Gravelines, France: 2 vCPU, 4 GB RAM, 40 GB disk) runs a separate copy of the system for each madrasah.
Each copy has its own database, its own encryption keys, its own files and its own web address, so no madrasah can see another's data.
Because the data is stored in France (EU), say so in each madrasah's privacy notice.

```
/srv/madrasah/
  madrasah          the script for everything below
  compose.yml       shared Postgres + Caddy (HTTPS)
  src/              the code, sent by ship.sh
  tenants/<name>.env   each madrasah's settings and keys (only the ubuntu user can read these)
  sites/<name>.caddy   each madrasah's web address
  backups/<name>/      nightly database and file backups, kept 14 days
  secrets/pg_password  Postgres admin password
```

## The main site (homepage)

The bare domain (now `213-32-71-244.sslip.io`, later your own) shows the Madressa System homepage with the "Start free trial" form. It is a copy of the app like any madrasah's, called `main`, with two extra settings in `tenants/main.env`:

```bash
MARKETING_SITE=1                                   # / shows the homepage instead of the admin app
EARLY_ACCESS_NOTIFY_EMAIL=you@example.org          # who is emailed about each sign-up (once email is switched on)
```

Set it up once (or move it to a new domain the same way):

```bash
./madrasah add main 213-32-71-244.sslip.io
printf 'MARKETING_SITE=1
EARLY_ACCESS_NOTIFY_EMAIL=you@example.org
' >> tenants/main.env
./madrasah restart main
./madrasah signups                                 # list the sign-ups (newest first)
./madrasah messages                                # list the contact-form messages (newest first)
./madrasah owner you@example.org                   # your owner-dashboard account: prints a one-time setup link
```

Emails aren't sent yet, so `./madrasah signups` and `./madrasah messages` are where to see them. Messages are kept in the mail queue, so don't use "Delete sent emails before this date" in the main site's admin. The homepage's text is in `src/app/_marketing/`; change it and run `deploy/ship.sh`.

Your owner dashboard is at `/owner` on the main site only. `./madrasah owner <your email>` prints a one-time setup link (24 hours) where you choose a password and add the key to an authenticator app. If you lose your phone or password, run it again: it signs out every device and starts setup afresh.

The dashboard's health checks need nothing from you: `./madrasah update` (run by `ship.sh`) gives every copy the private token, mounts `owner/` into the main site's copy, adds a cron entry that runs `./owner-health` every 5 minutes, and runs it once. `./owner-health` only reads (disk, memory, CPU, containers, backup files) and writes `owner/health.json`; its log is `owner/cron.log`. `./owner-health --check` runs its self-checks.

"Restart" and "Back up now" on the dashboard are requests: `./owner-actions` (cron, every minute) runs `./madrasah restart <name>` or `./madrasah backup <name>` for a madrasah on this server, and nothing else; its log is `owner/actions.log`. `./owner-actions --check` runs its self-checks.

## Signing in to the server

From this computer, in Git Bash or PowerShell:

```bash
ssh -i ~/.ssh/madrasah_vps ubuntu@213.32.71.244
```

Password sign-in is turned off; only that key works. Keep a copy of `~/.ssh/madrasah_vps` somewhere safe (a password manager). If it's lost, use OVH's rescue console.

## Sending a new version

Commit, then from the repository on your computer:

```bash
deploy/ship.sh
```

It sends the committed code, builds it on the server (a few minutes) and restarts every madrasah. Each one is offline for under a minute while it restarts and updates its database.

## Adding a madrasah

1. In Namecheap, add an **A record** for the address (e.g. `raheemi` under your domain) pointing to `213.32.71.244`, and wait until it works.
2. On the server:

   ```bash
   cd /srv/madrasah
   ./madrasah add raheemi raheemi.yourdomain.co.uk
   grep SETUP_CODE tenants/raheemi.env
   ```

3. Give the madrasah's admin the setup code. They open `https://raheemi.yourdomain.co.uk/admin/setup`, enter it, and create the first admin account.

`./madrasah add <name> <address> --demo` makes a copy filled with fictional sample data instead, and gives each sample login its own password.

## Passwords

```bash
cat tenants/demo.passwords                       # each login's current password (portal, email, password)
./madrasah password demo parent001@example.org   # a new password for one login
./madrasah password demo --all                   # new passwords for every login
./madrasah password demo --all 'Demo#123'        # the same chosen password for every login
```

A new password signs that person out everywhere and is written to `tenants/<name>.passwords`, readable only by the ubuntu user. It stays when the app restarts or updates. People can still change their own password in the app; this file then shows the old one.

Until you have a domain, use `<name>.213-32-71-244.sslip.io` (sslip.io points any such name at this server), e.g. `./madrasah add flc flc.213-32-71-244.sslip.io`.

Teachers and parents get their first password from the admin: on their page, **Get a set-password link** makes a one-time link to copy or send on WhatsApp (or the admin types a password in their edit form, which they must change when they first sign in).

## Everyday commands

```bash
./madrasah list               # every madrasah, its address, and whether it's running
./madrasah logs raheemi       # its recent log (Ctrl+C to stop)
./madrasah restart raheemi
./madrasah backup             # what cron runs every night at 02:00 UTC
```

## Keys: keep a copy off the server

Each `tenants/<name>.env` holds that madrasah's `DATA_ENCRYPTION_KEY` and `BACKUP_ENCRYPTION_KEY`. Without them its data and backups can't be read.
Copy each file into a password manager when you add a madrasah.

## Backups

- Every night the app makes its own encrypted backup (Tools, Backups in the admin app), and cron dumps every database and file store into `/srv/madrasah/backups`.
- Both are on this server only. Before anyone stores real children's data, choose somewhere to copy them to every night (for example OVH Object Storage or Backblaze B2) so a lost server doesn't lose everything.

## Emails and texts

Emails and texts are not sent yet (`EMAIL_DRIVER=log`, `SMS_DRIVER=log` in each `tenants/<name>.env`). Phone notifications (`PUSH_DRIVER=webpush`) are sent for real.
Until email is turned on, only the admin made with the setup code can sign in: other staff, teachers and parents get their set-password link by email.

## Your other project

It can run beside these: its own container on the `madrasah_apps` network, its own database (`create database …` in the shared Postgres, or its own), and its own `sites/<name>.caddy` file pointing Caddy at it. Then run `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.
