import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PW, signIn } from './sign-in';


async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('wrong password shows one generic message; right password reaches the dashboard', async ({ page }) => {
  await page.goto('/admin/settings');
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fsettings/);
  await page.getByLabel('Email').fill('admin@example.org');
  await page.getByLabel('Password').fill('not the password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.ra-alert')).toHaveText('Email or password is incorrect.');
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/settings\/profile$/);
});

test('admin session does not open other portals, and sign out ends it', async ({ page }) => {
  await signIn(page);
  await page.goto('/teacher');
  await expect(page).toHaveURL(/\/teacher\/login$/);
  await page.goto('/admin');
  await page.getByRole('button', { name: /account menu/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('staff without Super access are kept out of Settings by the server', async ({ page }) => {
  await signIn(page, 'clerk@example.org');
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  for (const path of ['/admin/settings/profile', '/admin/settings/staff', '/admin/settings/fees', '/admin/settings/audits']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/no-access$/);
  }
});

test('a settings tab validates on the server and saves', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/settings/fees');
  await page.getByLabel('Sort code').fill('12-34');
  await page.getByLabel('Payment reference template').fill('FEES-{NOPE}');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Use the format 12-34-56.')).toBeVisible();
  await expect(page.getByText('Uses an unknown variable.')).toBeVisible();
  await page.getByLabel('Sort code').fill('12-34-56');
  await page.getByLabel('Payment reference template').fill('MADRASAH-FEES-{DATE_YMD}-S{STUDENT_IDS}');
  await page.getByLabel('Admission fee amount').fill('25.50');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toHaveText('Fees settings saved.');
  await page.reload();
  await expect(page.getByLabel('Admission fee amount')).toHaveValue('25.50');
  await page.goto('/admin/settings/audits');
  await expect(page.getByRole('cell', { name: 'Updated Fees settings' }).first()).toBeVisible();
});

test('year switcher changes which year’s holidays are shown', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/settings/holidays');
  await expect(page.getByRole('heading', { name: 'Holidays in 2026/27' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Half term', exact: true })).toBeVisible();
  await page.getByLabel('Academic year').selectOption({ label: '2025/26' });
  await expect(page.getByRole('heading', { name: 'Holidays in 2025/26' })).toBeVisible();
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await page.getByLabel('Academic year').selectOption({ label: '2026/27' });
  await expect(page.getByRole('heading', { name: 'Holidays in 2026/27' })).toBeVisible();
});

test('“/” focuses search, and a sticky note can be added to a page', async ({ page }) => {
  await signIn(page);
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox', { name: /Search students/ })).toBeFocused();
  await page.keyboard.type('Nobody Called This');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('No students, contacts or teachers match “Nobody Called This”.');
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Add a sticky note' }).click();
  await page.getByRole('textbox', { name: 'Note' }).fill('Order more register books');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByRole('region', { name: 'Sticky notes on this page' })).toContainText('Order more register books');
  await page.goto('/admin/tools/sticky-notes');
  await expect(page.getByText('1 note across the admin pages')).toBeVisible();
});

test('a new staff member can sign in with only the access they were given', async ({ page, browser }) => {
  await signIn(page);
  await page.goto('/admin/settings/staff/new');
  await page.getByLabel('Name').fill('Sample Staff Three With A Rather Long Name For Wrapping');
  await page.getByLabel('Email (login)').fill('staff3@example.org');
  await page.getByLabel('Password', { exact: true }).fill('another long password');
  await page.getByLabel('Can edit').check();
  await page.getByRole('button', { name: 'Add staff member' }).click();
  await expect(page).toHaveURL(/\/admin\/settings\/staff$/);
  await expect(page.getByRole('cell', { name: /^Sample Staff Three.*staff3@example\.org$/ })).toBeVisible();
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/admin/login');
  await p2.getByLabel('Email').fill('staff3@example.org');
  await p2.getByLabel('Password').fill('another long password');
  await p2.getByRole('button', { name: 'Sign in' }).click();
  await expect(p2).toHaveURL(/\/admin$/);
  await p2.goto('/admin/settings/staff');
  await expect(p2).toHaveURL(/\/admin\/no-access$/);
  await ctx.close();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`main screens pass axe in ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/admin/login');
    await axe(page);
    await signIn(page);
    for (const path of ['/admin', '/admin/settings/profile', '/admin/settings/years', '/admin/settings/holidays', '/admin/settings/staff', '/admin/settings/staff/new', '/admin/settings/audits', '/admin/settings/parentPortal', '/admin/settings/local', '/admin/tools/sticky-notes', '/admin/search?q=x']) {
      await page.goto(path);
      await axe(page);
    }
    await page.goto('/admin/settings/years/2/calendar');
    await axe(page);
  });
}
