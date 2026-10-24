import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { PW, signIn } from './sign-in';

test('system page: status, checklist and a working calendar feed', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/tools/system');
  await expect(page.getByRole('heading', { level: 1, name: 'System' })).toBeVisible();
  await expect(page.getByText('Automation services', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Setup checklist' })).toBeVisible();
  const feed = (await page.locator('code').filter({ hasText: '/calendar/' }).textContent())!;
  const ics = await page.request.get(new URL(feed).pathname);
  expect(ics.headers()['content-type']).toContain('text/calendar');
  expect(await ics.text()).toContain('SUMMARY:Half term (no classes)');
  expect((await page.request.get('/calendar/not-the-real-address-at-all.ics')).status()).toBe(404);
});

test('backups: make one now; deleting needs the school name', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/tools/backups');
  await page.getByRole('button', { name: 'Full backup now' }).click();
  await expect(page.getByRole('cell', { name: 'Sample Admin One' })).toBeVisible();
  await page.getByLabel('Type the school name to confirm').last().fill('Wrong School');
  await page.getByRole('button', { name: 'Delete backups older than 30 days' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Nothing was changed.' })).toBeVisible();
  await page.goto('/admin/tools/logs?kind=system');
  await expect(page.getByText(/Full backup made/)).toBeVisible();
});

test('logs record sign-ins; the developer API needs a key with the right scope', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/tools/logs?kind=staff');
  await expect(page.getByRole('cell', { name: 'Signed in' }).first()).toBeVisible();
  await page.goto('/admin/tools/api');
  await page.getByLabel('What it’s for').fill('Sample website');
  await page.getByRole('checkbox', { name: 'Students' }).check();
  await page.getByRole('button', { name: 'Create key' }).click();
  const msg = await page.getByRole('status').filter({ hasText: /rak_/ }).textContent();
  const key = /rak_[A-Za-z0-9_-]+/.exec(msg!)![0];
  const ok = await page.request.get('/api/v1/students', { headers: { authorization: `Bearer ${key}` } });
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.data.length).toBeGreaterThan(0);
  expect(Object.keys(body.data[0])).not.toContain('medical_notes');
  expect((await page.request.get('/api/v1/contacts', { headers: { authorization: `Bearer ${key}` } })).status()).toBe(401);
  expect((await page.request.get('/api/v1/students')).status()).toBe(401);
});

test('system tools are for super admins only, and the theme setting applies', async ({ page, browser }) => {
  const ctx = await browser.newContext();
  const clerk = await ctx.newPage();
  await signIn(clerk, 'clerk@example.org', PW);
  for (const p of ['/admin/tools/system', '/admin/tools/backups', '/admin/tools/logs', '/admin/tools/email', '/admin/tools/api']) {
    await clerk.goto(p);
    await expect(clerk, p).toHaveURL(/\/admin\/no-access$/);
  }
  await ctx.close();
  await signIn(page);
  await page.goto('/admin/settings/preferences');
  await page.getByLabel('Header and menu theme').selectOption('dark');
  await page.getByRole('button', { name: /Save/ }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Preferences saved.' }).first()).toBeVisible();
  await page.goto('/admin');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/admin/settings/preferences');
  await page.getByLabel('Header and menu theme').selectOption('system');
  await page.getByRole('button', { name: /Save/ }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Preferences saved.' }).first()).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`system tools pass axe in ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page);
    for (const path of ['/admin/tools/system', '/admin/tools/backups', '/admin/tools/logs', '/admin/tools/email', '/admin/tools/api', '/admin/tools/portals', '/admin/docs']) {
      await page.goto(path);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((x) => `${path} ${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  });
}
