import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './sign-in';

test('dashboard shows today’s figures and panels, and its shortcuts work', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Sample$/ })).toBeVisible();
  const kpis = page.locator('.ra-kpi-top');
  await expect(kpis).toHaveText(['Current students', 'Attendance today', 'Fees outstanding', 'Parents on portal', 'Teachers signed in']);
  for (const h of ['Weekly attendance', 'Students by age group', 'Unread messages', 'Teacher sign-in', 'Recent payments', 'Fees by type']) await expect(page.getByRole('heading', { level: 2, name: h })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Students by age group: / })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Fees by type: / })).toBeVisible();
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Take register' }).click();
  await expect(page).toHaveURL(/\/admin\/register$/);
});

test('staff without fees access see no fees figures on the dashboard', async ({ page, browser }) => {
  await signIn(page);
  await page.goto('/admin/settings/staff/new');
  await page.getByLabel('Name').fill('Dashboard Viewer');
  await page.getByLabel('Email (login)').fill('dash.viewer@example.org');
  await page.getByLabel('Password', { exact: true }).fill('dash viewer password');
  await page.getByRole('button', { name: 'Add staff member' }).click();
  const ctx = await browser.newContext();
  const v = await ctx.newPage();
  await signIn(v, 'dash.viewer@example.org', 'dash viewer password');
  await expect(v.locator('.ra-kpi-top')).toHaveText(['Current students', 'Attendance today', 'Parents on portal', 'Teachers signed in']);
  await expect(v.getByRole('heading', { level: 2, name: 'Teacher sign-in' })).toBeVisible();
  for (const gone of ['Recent payments', 'Fees by type', 'Record payment', 'Add student']) await expect(v.getByText(gone, { exact: true })).toHaveCount(0);
  await expect(v.locator('main')).not.toContainText('overdue');
  await expect(v.locator('main')).not.toContainText('£');
  await ctx.close();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`dashboard passes axe in ${scheme} theme, at desktop and phone widths`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin');
      await expect(page.getByRole('heading', { level: 2, name: 'Fees by type' })).toBeVisible();
      // Banners and tiles fade in; measure contrast once they have finished.
      await page.waitForFunction(() => document.getAnimations().every((an) => an.playState !== 'running'));
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('nextjs-portal').analyze();
      expect(r.violations.map((x) => `${width} ${x.id}: ${x.nodes.map((n) => n.target.join(' ') + ' ' + (n.failureSummary ?? '')).join(', ')}`)).toEqual([]);
    }
  });
}
