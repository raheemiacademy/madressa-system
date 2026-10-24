import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './sign-in';


test('add a student with a new parent and a class, then find them', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/students/new');
  await page.getByLabel('First name').fill('Zebedee');
  await page.getByLabel('Surname').fill('Example-Testchild');
  await page.getByLabel('Date of birth').fill('2017-04-12');
  await page.getByLabel('Class', { exact: true }).selectOption({ label: 'Test Class A' });
  await page.getByLabel('Status').selectOption('Current');
  await page.getByLabel('Medical notes').fill('Carries an inhaler');
  await page.getByRole('button', { name: 'New contact' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Sample Parent Zed');
  await page.getByLabel('Email', { exact: true }).fill('parent.zed@example.org');
  await page.getByRole('button', { name: 'Add student' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Zebedee Example-Testchild');
  await expect(page.getByText('Carries an inhaler')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sample Parent Zed' })).toBeVisible();
  await expect(page.getByText('Test Class A').first()).toBeVisible();

  await page.getByRole('searchbox', { name: /Search students/ }).fill('zebedee');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Students' }).getByRole('link', { name: 'Zebedee Example-Testchild' })).toBeVisible();
});

test('validation errors show on the student form without saving', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/students/new');
  await page.getByLabel('Date of birth').fill('2999-01-01');
  await page.getByRole('button', { name: 'Add student' }).click();
  await expect(page.getByText('Add a first name')).toBeVisible();
  await expect(page.getByText('Date of birth can’t be in the future')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/students\/new$/);
});

test('bulk-activate waiting-list students into a class', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/students?status=Waiting+List');
  const boxes = page.getByRole('checkbox', { name: /^Select Test Student/ });
  const n = await boxes.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  await page.getByLabel(/With \d+ selected students?/).selectOption('activate');
  const bulk = page.getByRole('region', { name: 'Bulk actions' });
  await bulk.getByLabel('Class', { exact: true }).selectOption({ label: 'Test Class C' });
  await bulk.getByLabel('Start date').fill('2026-10-05');
  await page.getByRole('button', { name: /^Apply to/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Updated' })).toBeVisible();
  await page.goto('/admin/students?status=Waiting+List');
  await expect(page.getByText('Nothing matches these filters.')).toBeVisible();
});

test('permanent delete needs the exact school name', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/students?q=Student+021');
  await page.getByRole('checkbox', { name: 'Select Test Student 021' }).check();
  await page.getByText('Permanently delete the selected students').click();
  await page.getByLabel('School name').fill('Wrong School');
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText('Type the school name exactly as it appears in the school profile')).toBeVisible();
  await page.getByLabel('School name').fill('  sample   ACADEMY ');
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Permanently deleted 1 student' })).toBeVisible();
  await page.goto('/admin/settings/audits');
  await expect(page.getByRole('cell', { name: 'Permanently deleted 1 student' })).toBeVisible();
});

test('import students from pasted CSV: preview, then only good rows are saved', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/import/students');
  await page.getByLabel('Or paste rows (with the heading row)').fill('first_name,surname,dob,class\nImported,Kid One,05/06/2018,Test Class B\nBroken,,31/02/2018,No Such Class');
  await page.getByRole('button', { name: 'Check rows' }).click();
  await expect(page.getByText('1 ready, 1 with problems.')).toBeVisible();
  await expect(page.getByText(/No class called “No Such Class”/)).toBeVisible();
  await page.getByRole('button', { name: '3. Import 1 row' }).click();
  await expect(page.getByText('Import finished: 1 added, 0 updated, 1 skipped.')).toBeVisible();
  await page.goto('/admin/students?q=kid+one');
  await expect(page.getByRole('link', { name: 'Imported Kid One', exact: true })).toBeVisible();
});

test('public application form creates waiting-list students once opened', async ({ page, browser }) => {
  const anon = await browser.newPage();
  await anon.goto('/apply');
  await expect(anon.getByText('Applications are not open at the moment.')).toBeVisible();
  await signIn(page);
  await page.goto('/admin/settings/registration');
  await page.getByLabel('Accept applications through the public form').check();
  await page.getByLabel('Copy the parent’s surname to each child automatically').check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toHaveText('Registration pages saved.');
  await anon.reload();
  await anon.getByLabel('Full name').fill('Sample Applicant Parent');
  await anon.getByLabel('Email').fill('applicant@example.org');
  await anon.getByLabel('Mobile').fill('07700 900777');
  await anon.getByLabel('First name').fill('Appliedchild');
  await anon.getByLabel(/Date of birth/).fill('2019-02-02');
  await anon.getByRole('button', { name: 'Send application' }).click();
  await expect(anon.getByRole('status')).toContainText('now on our waiting list');
  await page.goto('/admin/students?q=appliedchild');
  await expect(page.getByRole('link', { name: 'Appliedchild Parent', exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: /Appliedchild/ }).getByText('Waiting List')).toBeVisible();
  await anon.close();
});

test('teachers and parents given a password by the school must choose their own, and only reach their own portal', async ({ page, browser }) => {
  await signIn(page);
  await page.goto('/admin/teachers/new');
  await page.getByLabel('Full name').fill('Portal Teacher Example');
  await page.getByLabel('Email (portal login)').fill('portal.teacher@example.org');
  await page.getByLabel('Portal password').fill('teacher password 123');
  await page.getByRole('button', { name: 'Add teacher' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Portal Teacher Example');
  await page.goto('/admin/contacts/1/edit');
  await page.getByLabel('Set portal password').fill('parent password 123');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/password set by the school, to be changed at next sign-in, never signed in/)).toBeVisible();

  const ctx = await browser.newContext();
  const t = await ctx.newPage();
  // Question 14: an admin-chosen password works once, then its owner must choose their own.
  async function firstSignIn(portal: 'teacher' | 'parent', email: string, pw: string, next: string) {
    await t.goto(`/${portal}/login`);
    await t.getByLabel('Email').fill(email);
    await t.getByLabel('Password').fill(pw);
    await t.getByRole('button', { name: 'Sign in' }).click();
    await expect(t).toHaveURL(new RegExp(`/${portal}/change-password$`));
    await t.getByLabel('New password').fill(next);
    await t.getByLabel('Type it again').fill(next);
    await t.getByRole('button', { name: 'Save password' }).click();
    await expect(t).toHaveURL(new RegExp(`/${portal}$`));
  }
  await firstSignIn('teacher', 'portal.teacher@example.org', 'teacher password 123', 'my own teacher password');
  await expect(t.getByText('Signed in as portal.teacher@example.org')).toBeVisible();
  await t.goto('/admin');
  await expect(t).toHaveURL(/\/admin\/login/);
  await firstSignIn('parent', 'parent001@example.org', 'parent password 123', 'my own parent password');
  await t.goto('/parent/login');
  await signIn(t, 'portal.teacher@example.org', 'my own teacher password', 'parent').catch(() => null);
  await expect(t.locator('.ra-alert')).toHaveText('Email or password is incorrect.');
  await ctx.close();
});

test('class page: teacher privileges and a timetable session', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/classes/3');
  await page.getByLabel('Add a teacher').selectOption({ label: 'Sample Teacher Three' });
  await page.getByRole('button', { name: 'Add teacher' }).click();
  await expect(page.locator('summary', { hasText: 'Sample Teacher Three' })).toBeVisible();
  await page.getByText('Add a session').click();
  await page.getByLabel('Day', { exact: true }).selectOption('Wednesday');
  await page.getByLabel('Start time').fill('18:00');
  await page.getByRole('button', { name: 'Add session' }).click();
  await expect(page.getByRole('cell', { name: 'Wednesday', exact: true })).toBeVisible();
});

test('staff without the right access level are refused on the server', async ({ page, browser }) => {
  await signIn(page);
  await page.goto('/admin/settings/staff/new');
  await page.getByLabel('Name').fill('View Only Example');
  await page.getByLabel('Email (login)').fill('viewonly@example.org');
  await page.getByLabel('Password', { exact: true }).fill('view only password');
  await page.getByRole('button', { name: 'Add staff member' }).click();
  const ctx = await browser.newContext();
  const v = await ctx.newPage();
  await signIn(v, 'viewonly@example.org', 'view only password');
  await v.goto('/admin/students');
  await expect(v.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible();
  await expect(v.getByRole('link', { name: 'Add student' })).toHaveCount(0);
  for (const p of ['/admin/students/new', '/admin/students/1/edit', '/admin/teachers/new', '/admin/classes/new', '/admin/import/students', '/admin/settings/custom-fields']) {
    await v.goto(p);
    await expect(v, p).toHaveURL(/\/admin\/no-access$/);
  }
  const csv = await v.request.get('/admin/import/students/template');
  expect(csv.status()).toBe(404);
  await ctx.close();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`phase 2 screens pass axe in ${scheme} theme`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page);
    for (const path of ['/admin/students', '/admin/students/new', '/admin/students/2', '/admin/students/2/history', '/admin/students/portal-access', '/admin/students/siblings', '/admin/students/walk-home',
      '/admin/students/registration', '/admin/contacts', '/admin/contacts/2', '/admin/contacts/tools', '/admin/teachers', '/admin/teachers/1', '/admin/teachers/new', '/admin/teachers/hours?teacher=1',
      '/admin/classes', '/admin/classes/1', '/admin/classes/timetable', '/admin/import/students', '/admin/settings/custom-fields', '/admin/settings/year-groups', '/admin/settings/years/wizard']) {
      await page.goto(path);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((x) => `${path} ${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
    await page.goto('/apply');
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map((x) => x.id)).toEqual([]);
  });
}
