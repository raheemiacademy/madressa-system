import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser } from '@playwright/test';
import postgres from 'postgres';
import { PW, signIn } from './sign-in';

const sql = postgres(process.env.DATABASE_URL_TEST ?? '', { max: 1, onnotice: () => {} });
test.afterAll(() => sql.end());
const setTab = async (tab: string, value: Record<string, unknown>) => { await sql`insert into setting (tab, value) values (${tab}, ${sql.json(value as never)}) on conflict (tab) do update set value = excluded.value`; };
const id = async (surname: string) => (await sql<{ id: number }[]>`select id from student where surname = ${surname}`)[0]!.id;
const lastMonday = () => { const d = new Date(); while (d.getDay() !== 1) d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); };

async function portal(browser: Browser, who: 'parent' | 'teacher') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signIn(page, who === 'parent' ? 'parent001@example.org' : 'teacher1@example.org', PW, who);
  return { page, ctx };
}

test('parent: own children only, and a late notice reaches the school', async ({ browser }) => {
  const { page, ctx } = await portal(browser, 'parent');
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Sample' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Choose child' }).getByRole('link')).toHaveCount(2);
  // Another family's child is a 404 on the server, not just hidden.
  const r = await page.goto(`/parent/attendance?child=${await id('Student 002')}`);
  expect(r?.status()).toBe(404);
  await page.goto('/parent/attendance/notice');
  await page.getByRole('radio', { name: 'Late' }).check();
  await page.getByLabel('Reason (optional)').fill('Sample bus delay');
  await page.getByRole('button', { name: 'Send to the school' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Sent\./ })).toBeVisible();
  await page.goto('/parent/attendance');
  await expect(page.getByText('Sample bus delay')).toBeVisible();
  await ctx.close();
});

test('teacher sets homework with uploads, the parent hands in a PDF, the teacher sees it', async ({ browser }) => {
  const t = await portal(browser, 'teacher');
  await t.page.goto('/teacher/homework');
  await t.page.getByLabel('Title').fill('Sample recitation task');
  await t.page.getByRole('button', { name: 'Set homework' }).click();
  await expect(t.page.getByRole('status').filter({ hasText: /Set for \d+ students/ })).toBeVisible();

  const p = await portal(browser, 'parent');
  await p.page.goto('/parent/homework');
  const card = p.page.getByRole('article', { name: 'Sample recitation task' });
  await card.getByLabel('Add a recording, photo or PDF').setInputFiles({ name: 'recitation.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample hand-in') });
  await card.getByRole('button', { name: 'Hand in' }).click();
  await expect(p.page.getByRole('link', { name: 'recitation.pdf' })).toBeVisible();

  await t.page.goto('/teacher/homework');
  await t.page.getByRole('link', { name: /Sample recitation task/ }).click();
  await expect(t.page.getByText(/^1 of \d+ handed in$/)).toBeVisible();
  const href = await t.page.getByRole('link', { name: /^Handed in/ }).getAttribute('href');
  expect((await t.page.request.get(href!)).headers()['content-type']).toBe('application/pdf');
  // The parent who handed it in can open it too (other families are covered by the server tests).
  expect((await p.page.request.get(href!)).status()).toBe(200);
  await t.ctx.close(); await p.ctx.close();
});

test('teacher takes a register for a class with the privilege, and is refused for another class', async ({ browser }) => {
  const { page, ctx } = await portal(browser, 'teacher');
  await page.goto(`/teacher/register?date=${lastMonday()}`);
  await page.getByRole('link', { name: /Test Class A/ }).click();
  await page.getByRole('button', { name: 'All present' }).click();
  await page.getByRole('button', { name: 'Save register' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Register saved.' })).toBeVisible();
  const classB = (await sql<{ id: number }[]>`select id from school_class where name = 'Test Class B'`)[0]!.id;
  expect((await page.goto(`/teacher/register/${classB}`))?.status()).toBe(404);
  await ctx.close();
});

test('parent opts in to an event, then pays by card in test mode', async ({ browser }) => {
  await setTab('gateways', { stripeEnabled: true });
  const { page, ctx } = await portal(browser, 'parent');
  // Test Student 001 was already opted in by the learning tests, so use the parent's other child.
  await page.goto(`/parent/events?child=${await id('Student 004')}`);
  await page.getByRole('checkbox', { name: /I give permission/ }).check();
  await page.getByRole('button', { name: /^Opt .* in$/ }).click();
  // The form is replaced by the opt-in itself, with its cost.
  await expect(page.getByText('£12, added to your fees')).toBeVisible();
  await page.goto('/parent/fees');
  await page.getByRole('button', { name: /by card$/ }).click();
  await expect(page.getByText(/Test mode: no money was taken/)).toBeVisible();
  await expect(page.getByText(/being confirmed/).first()).toBeVisible();
  await setTab('gateways', {});
  await ctx.close();
});

test('parent writes to the office and the office replies', async ({ browser, page }) => {
  const p = await portal(browser, 'parent');
  await p.page.goto('/parent/messages/new');
  await p.page.getByLabel('To').selectOption({ label: 'The office' });
  await p.page.getByLabel('Subject').fill('Sample question about the trip');
  await p.page.getByRole('textbox', { name: 'Message' }).fill('What time is pick-up?');
  await p.page.getByRole('button', { name: 'Send' }).click();
  await expect(p.page.getByRole('heading', { level: 1, name: 'Sample question about the trip' })).toBeVisible();
  await signIn(page);
  await page.goto('/admin/messages');
  await page.getByRole('link', { name: /Sample question about the trip/ }).click();
  await page.getByRole('textbox', { name: 'Reply' }).fill('Pick-up is at 15:30.');
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /Reply sent/ }).first()).toBeVisible();
  await p.page.reload();
  await expect(p.page.getByText('Pick-up is at 15:30.')).toBeVisible();
  await p.ctx.close();
});

test('sections the school hides are refused on the server', async ({ browser }) => {
  await setTab('parentPortal', { hiddenSections: ['Fees'] });
  const { page, ctx } = await portal(browser, 'parent');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Fees' })).toHaveCount(0);
  expect((await page.goto('/parent/fees'))?.status()).toBe(404);
  await setTab('parentPortal', { disabled: true, disabledMessage: 'Back after half term.' });
  await page.goto('/parent');
  await expect(page.getByText('Back after half term.')).toBeVisible();
  await setTab('parentPortal', {});
  await ctx.close();
});

test('the portals are installable apps with an offline page', async ({ request }) => {
  const m = await (await request.get('/pwa/parent')).json();
  expect(m).toMatchObject({ start_url: '/parent', display: 'standalone', short_name: 'Parents' });
  expect((await request.get('/pwa/teacher')).status()).toBe(200);
  expect((await request.get('/sw.js')).status()).toBe(200);
  expect((await request.get('/offline.html')).status()).toBe(200);
  expect((await request.get(m.icons[0].src)).headers()['content-type']).toBe('image/png');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`portal screens pass axe in ${scheme} theme at phone width`, async ({ browser }) => {
    test.setTimeout(240_000);
    for (const who of ['parent', 'teacher'] as const) {
      const { page, ctx } = await portal(browser, who);
      await page.emulateMedia({ colorScheme: scheme });
      const paths = who === 'parent'
        ? ['/parent', '/parent/attendance', '/parent/attendance/notice', '/parent/attendance/holiday', '/parent/fees', '/parent/homework', '/parent/more', '/parent/messages', '/parent/messages/new', '/parent/events',
          '/parent/reports', '/parent/results', '/parent/merits', '/parent/incidents', '/parent/shop', '/parent/files', '/parent/forums', '/parent/forums/1', '/parent/forums/topic/1', '/parent/child']
        : ['/teacher', '/teacher/register', `/teacher/register?date=${lastMonday()}`, '/teacher/homework', '/teacher/messages', '/teacher/messages/new', '/teacher/more', '/teacher/classes', '/teacher/merits', '/teacher/incidents',
          '/teacher/exams', '/teacher/exams/1', '/teacher/reports', '/teacher/reports/1?class=1', '/teacher/events', '/teacher/holidays', '/teacher/forums', '/teacher/files', '/teacher/logs', '/teacher/drill'];
      for (const path of paths) {
        await page.goto(path);
        await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(r.violations.map((x) => `${path} ${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} scrolls sideways`).toBe(true);
      }
      await ctx.close();
    }
  });
}

test('on a computer the portals have a sidebar instead of the bottom tabs, and pass axe', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const who of ['parent', 'teacher'] as const) {
    const { page, ctx } = await portal(browser, who);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${who}`);
    const side = page.getByRole('navigation', { name: 'Sections' });
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
    await expect(side.getByRole('link', { name: who === 'parent' ? 'Home' : 'Today', exact: true })).toHaveAttribute('aria-current', 'page');
    // Items from the More page are in the sidebar too.
    await side.getByRole('link', { name: 'Forums' }).click();
    await expect(page).toHaveURL(new RegExp(`/${who}/forums$`));
    await expect(side.getByRole('link', { name: 'Forums' })).toHaveAttribute('aria-current', 'page');
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of [`/${who}`, `/${who}/homework`, `/${who}/messages`]) {
        await page.goto(path);
        await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(r.violations.map((x) => `${scheme} ${path} ${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${who}`);
    await page.getByRole('button', { name: 'Dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'true');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(new RegExp(`/${who}/login$`));
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0);
    await ctx.close();
  }
});
