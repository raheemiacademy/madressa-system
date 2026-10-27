import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './sign-in';

/** The most recent term-time Monday strictly before today, in UK dates (seeded registers sit on Mondays). */
function lastMonday() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const iso = () => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  do d.setDate(d.getDate() - 1); while (d.getDay() !== 1 || SEEDED_HOLIDAY_MONDAYS.includes(iso()));
  return iso();
}
// The seed's half term and winter break have no classes.
const SEEDED_HOLIDAY_MONDAYS = ['2026-10-26', '2026-12-21', '2026-12-28'];

test('take a register, then authorise an absence from the grid', async ({ page }) => {
  await signIn(page);
  const date = lastMonday();
  await page.goto(`/admin/register/take?class=1&date=${date}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test Class A register');
  await page.getByRole('button', { name: 'All present' }).click();
  const first = page.getByRole('radiogroup').first();
  const name = await first.getAttribute('aria-label');
  await first.getByRole('radio', { name: 'Absent' }).check({ force: true });
  await page.getByRole('button', { name: 'Save register' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Register saved.' })).toBeVisible();

  await page.goto(`/admin/register/daily?class=1&month=${date.slice(0, 7)}`);
  const cell = page.getByRole('button', { name: new RegExp(`^${name}, ${date}: Unauthorised absence`) });
  await cell.click();
  await page.getByLabel('Note or reason', { exact: true }).fill('Doctor’s appointment');
  await page.getByRole('button', { name: 'Authorised', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^${name}, ${date}: Authorised absence, Doctor’s appointment`) })).toBeVisible();
  await page.goto('/admin/settings/audits');
  await expect(page.getByRole('cell', { name: /Took the Test Class A register/ }).first()).toBeVisible();
});

test('mark a student absent across dates, and accept a holiday request', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/register/absent?student=2');
  await page.getByLabel('From', { exact: true }).fill(lastMonday());
  await page.getByLabel('To', { exact: true }).fill(lastMonday());
  await page.getByLabel('Authorisation').selectOption('yes');
  await page.getByRole('button', { name: 'Complete registers' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Marked absent on 1 register/ })).toBeVisible();

  await page.goto('/admin/register/requests');
  const req = page.getByRole('article').first();
  await req.getByRole('button', { name: 'Authorise', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Authorise this holiday' });
  await expect(dialog.getByLabel('Message to the parent (optional)')).toHaveValue('Your holiday request has been authorised.');
  await dialog.getByLabel('Message to the parent (optional)').fill('Approved, have a safe trip.');
  await dialog.getByRole('button', { name: 'Authorise' }).click();
  await expect(dialog).toBeHidden();
  await expect(req.getByText('Accepted (authorised)')).toBeVisible();
  await expect(req.getByText('Response: Approved, have a safe trip.')).toBeVisible();
});

test('parent notice shows in the bell badge and on the notices page', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('link', { name: /^\d+ notifications?: parent notices and holiday requests/ })).toBeVisible();
  await page.goto('/admin/register/notices');
  await expect(page.getByRole('cell', { name: 'Dentist appointment' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark seen' }).click();
  await expect(page.getByText('Seen', { exact: true })).toBeVisible();
});

test('teacher logs: pick a teacher, update their week in a pop-up', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/teacher-logs');
  await page.getByRole('button', { name: /^Sample Teacher Two/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Sample Teacher Two' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: /note on/ }).first().fill('Covered by a colleague');
  await dialog.getByRole('button', { name: 'Save Sample’s logs' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: /^Sample Teacher Two: Saved \d+ logs?\.$/ })).toBeVisible();
});

test('teacher logs: prefill from working hours and save; kiosk sign-in with a PIN', async ({ page, browser }) => {
  await signIn(page);
  const date = lastMonday();
  await page.goto(`/admin/teacher-logs/add?t=2&prefill=1&from=${date}&to=${date}`);
  await page.getByRole('checkbox', { name: /absent on/ }).first().check();
  await page.getByRole('button', { name: 'Save logs' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved 1 log.' })).toBeVisible();

  await page.goto('/admin/teachers/1/edit');
  await page.getByLabel('Kiosk PIN').fill('2468');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sample Teacher One');

  const ctx = await browser.newContext();
  const k = await ctx.newPage();
  await k.goto('/kiosk');
  await expect(k.getByText('This device isn’t set up as a kiosk.')).toBeVisible();
  await signIn(k);
  await k.goto('/admin/teacher-logs/kiosk');
  await k.getByLabel('Device name').fill('Test tablet');
  await k.getByRole('button', { name: 'Set up this browser as a kiosk' }).click();
  await expect(k.getByRole('status').filter({ hasText: 'This browser is now a kiosk' })).toBeVisible();
  await k.goto('/kiosk');
  await k.getByLabel('Your name').selectOption({ label: 'Sample Teacher One' });
  await k.getByLabel('PIN').fill('1111');
  await k.getByRole('button', { name: 'Sign in or out' }).click();
  await expect(k.getByRole('status')).toHaveText('That PIN isn’t right.');
  await k.getByLabel('Your name').selectOption({ label: 'Sample Teacher One' });
  await k.getByLabel('PIN').fill('2468');
  await k.getByRole('button', { name: 'Sign in or out' }).click();
  await expect(k.getByRole('status')).toHaveText(/Sample Teacher One: signed in at \d\d:\d\d\./);
  await ctx.close();
});

test('fire drill: hold to start, mark a class safe, end and see the report', async ({ page }) => {
  await signIn(page);
  const hold = page.getByRole('button', { name: 'Hold to start drill' });
  await hold.hover();
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up(); // let go early: nothing starts
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/admin$/);
  await hold.hover();
  await page.mouse.down();
  await expect(page).toHaveURL(/\/admin\/fire-drill$/, { timeout: 8000 });
  await page.mouse.up();
  await expect(page.getByRole('status').filter({ hasText: 'Drill running' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark all safe' }).first().click();
  await expect(page.getByRole('button', { name: 'All safe ✓' }).first()).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'End drill and save report' }).click();
  await expect(page.getByRole('heading', { name: 'Start a fire drill' })).toBeVisible();
  await page.getByRole('link', { name: 'View report' }).first().click();
  await expect(page.getByRole('heading', { name: /^Report:/ })).toBeVisible();
});

test('deleting register entries needs the school name; view-only staff can’t take registers', async ({ page, browser }) => {
  await signIn(page);
  await page.goto('/admin/register/delete');
  await page.getByLabel('From', { exact: true }).fill('2000-01-01');
  await page.getByLabel('To', { exact: true }).fill('2000-01-31');
  await page.getByLabel('Class').selectOption({ index: 1 });
  await page.getByLabel('Type the school name to confirm').fill('nope');
  await page.getByRole('button', { name: 'Delete entries' }).click();
  await expect(page.getByText('Type the school name exactly as it appears in the school profile')).toBeVisible();

  await page.goto('/admin/settings/staff/new');
  await page.getByLabel('Name').fill('Attendance Viewer');
  await page.getByLabel('Email (login)').fill('att.viewer@example.org');
  await page.getByLabel('Password', { exact: true }).fill('viewer password 1');
  await page.getByRole('button', { name: 'Add staff member' }).click();
  const ctx = await browser.newContext();
  const v = await ctx.newPage();
  await signIn(v, 'att.viewer@example.org', 'viewer password 1');
  await v.goto('/admin/register');
  await expect(v.getByRole('heading', { name: 'Register', level: 1 })).toBeVisible();
  for (const p of ['/admin/register/take?class=1', '/admin/register/absent', '/admin/register/delete', '/admin/teacher-logs/add']) {
    await v.goto(p);
    await expect(v, p).toHaveURL(/\/admin\/no-access$/);
  }
  await ctx.close();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`phase 3 screens pass axe in ${scheme} theme`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page);
    for (const path of ['/admin/register', '/admin/register/daily', '/admin/register/take?class=1', '/admin/register/student/3', '/admin/register/authorise', '/admin/register/calendar',
      '/admin/register/stats', '/admin/register/requests', '/admin/register/alerts', '/admin/teacher-logs', '/admin/teacher-logs/absentees', '/admin/fire-drill', '/admin/settings/attendance-codes']) {
      await page.goto(path);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((x) => `${path} ${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  });
}
