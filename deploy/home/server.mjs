// The main website (home page, "Get started" requests, "Sign in to your madrasah"). Node's standard library only.
// Runs as the `home` service in ../compose.yml; Caddy sends the bare domain here. Requests are kept in /data/requests.jsonl
// and listed at /requests behind REQUESTS_PASSWORD (user "admin").
import { createServer } from 'node:http';
import { appendFile, readFile, stat } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';

const PUBLIC = path.join(import.meta.dirname, 'public');
const DATA = process.env.DATA_DIR || '/data';
const SITES = process.env.SITES_DIR || '/sites';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const NAME = /^[a-z0-9][a-z0-9-]{1,29}$/;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const hits = new Map(); // ip -> request times, for "5 requests an hour" per address

const send = (res, code, body, type = 'text/html; charset=utf-8', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', ...extra });
  res.end(body);
};
const redirect = (res, to) => { res.writeHead(303, { Location: to }); res.end(); };

async function page(res, file, host) {
  const html = await readFile(path.join(PUBLIC, file), 'utf8');
  send(res, 200, html.replaceAll('{{BASE}}', esc(host)), TYPES['.html'], { 'Cache-Control': 'no-cache' });
}

async function readForm(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 10_000) throw new Error('too big'); }
  return Object.fromEntries(new URLSearchParams(body));
}

async function saveRequest(req, res) {
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress;
  const now = Date.now(), recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 5) return send(res, 429, 'Too many requests from here. Please try again in an hour.', 'text/plain; charset=utf-8');
  let f;
  try { f = await readForm(req); } catch { return send(res, 413, 'That was too long.', 'text/plain; charset=utf-8'); }
  if (f.website) return redirect(res, '/thanks.html'); // the hidden field only bots fill in
  const clean = (k, max) => String(f[k] ?? '').trim().slice(0, max);
  const r = { at: new Date().toISOString(), madrasah: clean('madrasah', 120), name: clean('name', 120), email: clean('email', 200), phone: clean('phone', 40), students: clean('students', 20), message: clean('message', 2000) };
  if (!r.madrasah || !r.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return redirect(res, '/?missing=1#get-started');
  hits.set(ip, [...recent, now]);
  await appendFile(path.join(DATA, 'requests.jsonl'), JSON.stringify(r) + '\n', { mode: 0o600 });
  redirect(res, '/thanks.html');
}

function allowed(req) {
  const want = process.env.REQUESTS_PASSWORD;
  const [kind, b64] = String(req.headers.authorization ?? '').split(' ');
  if (!want || kind !== 'Basic' || !b64) return false;
  const given = Buffer.from(Buffer.from(b64, 'base64').toString().replace(/^admin:/, '')), expected = Buffer.from(want);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function listRequests(res) {
  const lines = (await readFile(path.join(DATA, 'requests.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean);
  const rows = lines.map((l) => JSON.parse(l)).reverse().map((r) => `<tr><td>${esc(new Date(r.at).toLocaleString('en-GB', { timeZone: 'Europe/London' }))}</td><td>${esc(r.madrasah)}</td><td>${esc(r.name)}</td>
    <td><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td><td>${esc(r.phone)}</td><td>${esc(r.students)}</td><td>${esc(r.message)}</td></tr>`).join('');
  send(res, 200, `<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Requests · Madrasah Manager</title><link rel="stylesheet" href="/site.css"><main class="wrap requests"><h1>Requests to join</h1>
${rows ? `<div class="scroll"><table><thead><tr><th>When</th><th>Madrasah</th><th>Name</th><th>Email</th><th>Phone</th><th>Students</th><th>Message</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p>No requests yet.</p>'}<p class="muted">${lines.length} ${lines.length === 1 ? 'request' : 'requests'}</p></main></html>`, TYPES['.html'], { 'Cache-Control': 'no-store' });
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const host = String(req.headers.host ?? '').replace(/:\d+$/, '');
    if (req.method === 'POST' && url.pathname === '/request') return await saveRequest(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Not allowed', 'text/plain');
    if (url.pathname === '/go') { // "Sign in to your madrasah": only to madrasahs that exist on this server
      const name = url.searchParams.get('name')?.trim().toLowerCase() ?? '';
      const known = NAME.test(name) && (await stat(path.join(SITES, `${name}.caddy`)).then(() => true, () => false));
      return redirect(res, known ? `https://${name}.${host}/admin` : `/?notfound=${encodeURIComponent(name.slice(0, 30))}#sign-in`);
    }
    if (url.pathname === '/requests') {
      if (!allowed(req)) return send(res, 401, 'Sign in to see requests.', 'text/plain', { 'WWW-Authenticate': 'Basic realm="Requests", charset="UTF-8"' });
      return await listRequests(res);
    }
    if (url.pathname === '/') return await page(res, 'index.html', host);
    if (url.pathname === '/thanks.html') return await page(res, 'thanks.html', host);
    const file = url.pathname.slice(1), ext = path.extname(file);
    if (!TYPES[ext] || !/^[a-z0-9-]+\.[a-z]+$/i.test(file)) return send(res, 404, 'Not found', 'text/plain'); // flat public/ files only
    send(res, 200, await readFile(path.join(PUBLIC, file)), TYPES[ext], { 'Cache-Control': 'public, max-age=3600' });
  } catch (e) {
    if (e?.code === 'ENOENT') return send(res, 404, 'Not found', 'text/plain');
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Something went wrong.', 'text/plain');
  }
}).listen(Number(process.env.PORT) || 8080, () => console.log('Home site ready'));
