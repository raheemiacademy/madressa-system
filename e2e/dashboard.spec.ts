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

test('on a phone the admin is an app: bottom tabs, and More holds the menu, year and sign-out', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const tabs = page.getByRole('navigation', { name: 'Main' });
  await expect(tabs.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeHidden();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Dark mode' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fire drill' })).toBeVisible();
  await tabs.getByRole('link', { name: 'Students' }).click();
  await expect(page).toHaveURL(/\/admin\/students$/);
  await expect(tabs.getByRole('link', { name: 'Students' })).toHaveAttribute('aria-current', 'page');
  await tabs.getByRole('link', { name: 'More' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Academic year' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Learning' }).getByRole('link', { name: 'Homework' }).click();
  await expect(page).toHaveURL(/\/admin\/homework$/);
  await page.getByRole('link', { name: 'Search', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search students, contacts and teachers' }).fill('Test Student 001');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('link', { name: 'Test Student 001' })).toBeVisible();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/admin/more');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('nextjs-portal').analyze();
    expect(r.violations.map((x) => `${scheme} ${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
});

test('the Dark mode switch changes the theme on this device and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await signIn(page);
  const toggle = page.getByRole('banner').getByRole('button', { name: 'Dark mode' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('banner').getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('banner').getByRole('button', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
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
