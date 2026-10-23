import { expect, test } from '@playwright/test';

// Captures the main screens at the three checked widths in both themes into screenshots/ for review against design-reference.
const WIDTHS = [390, 860, 1440];
const PAGES = [['dashboard', '/admin'], ['settings-profile', '/admin/settings/profile'], ['holidays', '/admin/settings/holidays'], ['staff', '/admin/settings/staff'], ['tab-parent-portal', '/admin/settings/parentPortal'],
  ['students', '/admin/students'], ['student', '/admin/students/2'], ['classes', '/admin/classes'], ['class', '/admin/classes/1'], ['teachers', '/admin/teachers'], ['contacts', '/admin/contacts'], ['apply', '/apply']];

test('visual capture', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill('admin@example.org');
  await page.getByLabel('Password').fill(process.env.SEED_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const [name, path] of PAGES) {
        await page.goto(path!);
        await page.screenshot({ path: `screenshots/${name}-${w}-${scheme}.png`, fullPage: name !== 'tab-parent-portal' });
        // No horizontal page scroll at any width.
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    }
  }
  await page.context().clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/login');
  await page.screenshot({ path: 'screenshots/login-390-light.png' });
});
