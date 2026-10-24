import type { Browser } from 'playwright';

// One headless Chromium per process, started on first use (question 13: real PDFs).
let browser: Promise<Browser> | null = null;
async function chromium() {
  browser ??= import('playwright').then(({ chromium: c }) => c.launch()).catch((e) => { browser = null; throw e; });
  return browser;
}

const A4 = { format: 'A4' as const, printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' } };

/** Renders a self-contained HTML document (no network) to an A4 PDF. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const ctx = await (await chromium()).newContext({ javaScriptEnabled: false, offline: true });
  try {
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf(A4);
  } finally { await ctx.close(); }
}

/**
 * Prints one of our own admin pages to PDF as the signed-in user, so the page's permission checks still apply.
 * Only same-origin /admin/ paths are accepted; the cookie is set for that origin only.
 */
export async function adminPageToPdf(origin: string, path: string, cookie: { name: string; value: string }): Promise<Buffer> {
  if (!/^\/admin\/[A-Za-z0-9/_?&=.%-]*$/.test(path) || path.includes('//') || path.includes('..')) throw new Error('Bad path');
  const url = new URL(path, origin);
  const ctx = await (await chromium()).newContext();
  try {
    await ctx.addCookies([{ name: cookie.name, value: cookie.value, url: url.origin, httpOnly: true, sameSite: 'Lax' }]);
    // Other origins are refused, so a page can't make the renderer fetch anything else.
    await ctx.route((u) => u.origin !== url.origin, (r) => r.abort());
    const page = await ctx.newPage();
    await page.emulateMedia({ media: 'print', colorScheme: 'light' });
    const res = await page.goto(url.toString(), { waitUntil: 'networkidle' });
    if (!res || !res.ok() || new URL(page.url()).pathname !== url.pathname) throw new Error('Page not available');
    return await page.pdf(A4);
  } finally { await ctx.close(); }
}
