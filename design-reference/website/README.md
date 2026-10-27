# Madressa System website

Static site: upload every file in this folder to your web host (Netlify, Cloudflare Pages, cPanel, etc.).
`index.html` is the homepage at mydomain.com.

## Before going live, replace these placeholders (search all files)
- `[OFFER]` — your early-access offer (index.html, faq.html)
- `[YOUR EMAIL]` — your contact email (all pages, and in `data-email` on the forms)
- `[WHATSAPP NUMBER]` — international format without + or spaces, e.g. 447700900123 (all pages)
- `yourmadressa.madressasystem.com` in the hero browser bar — your real app address once known

## Forms
- Early-access form (index.html) sends JSON with POST to `/api/early-access`:
  `{ school, name, role, email, students, type }`
- Contact form (contact.html) sends JSON with POST to `/api/contact`:
  `{ name, email, school, topic, message }`
- Your app must answer with a 2xx status. Anything else shows the visitor an error with your email address.
- If the site and the app are on different domains, change each form's `action` to the full URL and allow CORS on the app.

## Notes
- Fonts load from Google Fonts (Fraunces and Inter). If they can't load, Georgia and the system font are used.
- All names and figures in the product screens are sample data.
