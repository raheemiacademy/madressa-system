import { expect, test } from '@playwright/test';
import { signIn } from './sign-in';

// Captures the main screens at the three checked widths in both themes into screenshots/ for review against design-reference.
const WIDTHS = [390, 860, 1440];
const PAGES = [['dashboard', '/admin'], ['settings-profile', '/admin/settings/profile'], ['holidays', '/admin/settings/holidays'], ['staff', '/admin/settings/staff'], ['tab-parent-portal', '/admin/settings/parentPortal'],
  ['students', '/admin/students'], ['student', '/admin/students/2'], ['classes', '/admin/classes'], ['class', '/admin/classes/1'], ['teachers', '/admin/teachers'], ['contacts', '/admin/contacts'], ['apply', '/apply'],
  ['register', '/admin/register'], ['daily', '/admin/register/daily'], ['take', '/admin/register/take?class=1'], ['record', '/admin/register/student/3'], ['tlogs', '/admin/teacher-logs'], ['drill', '/admin/fire-drill'],
  ['fees', '/admin/fees'], ['fees-student', '/admin/fees/student/2'], ['fees-structure', '/admin/fees/structure/1'], ['fees-annual', '/admin/fees/annual'],
  ['messages', '/admin/messages?t=1'], ['compose', '/admin/messages/new'], ['newsletter', '/admin/newsletters/1'], ['sms', '/admin/sms'], ['template', '/admin/settings/templates/fees.receipt'], ['set-password', '/teacher/set-password'],
  ['homework', '/admin/homework'], ['results', '/admin/exams/1/results'], ['eoty', '/admin/reports/1/print?class=1'], ['merits', '/admin/merits'], ['shop', '/admin/products'], ['event', '/admin/events/1'], ['incidents', '/admin/incidents']];

test('visual capture', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
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
