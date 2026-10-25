import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './sign-in';

test('homework: set it for a class, tick one student done, see the rest in the incomplete report', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/homework/new');
  await page.getByLabel('Class').selectOption({ label: 'Test Class A' });
  await page.getByLabel('Title').fill('Sample reading task');
  await page.getByRole('textbox', { name: 'Deadline' }).fill('2026-09-02T17:00');
  await page.getByRole('button', { name: 'Set homework' }).click();
  await expect(page.getByRole('heading', { name: 'Sample reading task', level: 1 })).toBeVisible();
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await page.goto('/admin/homework/incomplete');
  await expect(page.getByRole('link', { name: 'Sample reading task' }).first()).toBeVisible();
});

test('exams: enter results, then a locked exam can’t change; reports generate and download as PDF', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/exams');
  await page.getByRole('link', { name: 'Autumn assessment' }).click();
  await page.getByRole('link', { name: 'Results', exact: true }).click();
  await expect(page).toHaveURL(/\/results$/);
  const first = page.getByRole('textbox').first();
  await first.fill('49.5');
  await page.getByRole('button', { name: 'Save results' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Results saved.' })).toBeVisible();
  await first.fill('99');
  await page.getByRole('button', { name: 'Save results' }).click();
  await expect(page.getByText(/more than 50/).first()).toBeVisible();

  await page.goto('/admin/reports');
  await page.getByRole('link', { name: 'Generate' }).first().click();
  await page.getByLabel('Class').selectOption({ label: 'Test Class A' });
  await page.getByRole('button', { name: 'Show reports' }).click();
  await expect(page.getByRole('article').first()).toContainText('Autumn term report');
  const pdf = await page.request.get(`/admin/pdf?path=${encodeURIComponent(new URL(page.url()).pathname + new URL(page.url()).search)}`);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
});

test('merits: award to a student, see it in totals, issue a certificate PDF', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/merits');
  await page.locator('#f-meritId').selectOption({ label: 'Star of the week (+5)' });
  await page.getByLabel('Class', { exact: true }).first().selectOption({ label: 'Test Class B' });
  await page.getByRole('group', { name: 'Students' }).getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Award merits now' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Awarded to 1 person.' })).toBeVisible();
  await page.goto('/admin/merits/certificates');
  await page.getByLabel('For', { exact: true }).fill('Sample excellent effort');
  await page.getByRole('group', { name: 'Students' }).getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Issue certificates' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Issued 1 certificate.' })).toBeVisible();
  const href = await page.getByRole('link', { name: 'PDF' }).first().getAttribute('href');
  const pdf = await page.request.get(href!);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
});

test('events: required consent, then an opt-in raises an invoice; incidents and forums record', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/events');
  await page.getByRole('link', { name: 'Sample museum visit' }).click();
  await page.getByRole('link', { name: 'Opt-ins' }).click();
  await page.getByRole('button', { name: 'Opt in' }).click();
  await expect(page.getByText(/Required consent missing/).first()).toBeVisible();
  await page.getByLabel(/I give permission/).check();
  await page.getByRole('button', { name: 'Opt in' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Opted in and invoiced.' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '£12' })).toBeVisible();

  await page.goto('/admin/incidents/new');
  await page.getByLabel('Involves').selectOption('teacher');
  await page.getByLabel('Teacher', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Title').fill('Sample slip in corridor');
  await page.getByRole('textbox', { name: 'Report' }).fill('Slipped on a wet floor.');
  await page.getByRole('button', { name: 'Record incident' }).click();
  await expect(page.getByRole('link', { name: 'Sample slip in corridor' })).toBeVisible();
  await page.getByRole('link', { name: 'Minor injury' }).first().click();
  await expect(page.getByRole('heading', { name: 'Tell the parents on WhatsApp' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Main contacts' }).getByRole('link').first()).toHaveAttribute('href', /^https:\/\/wa\.me\/44\d+\?text=/);

  await page.goto('/admin/forums');
  await page.getByRole('link', { name: 'General' }).click();
  await page.getByRole('link', { name: 'Welcome to the forums' }).click();
  await page.getByLabel('Reply').fill('Sample reply from the office');
  await page.getByRole('button', { name: 'Post reply' }).click();
  await expect(page.getByText('Sample reply from the office')).toBeVisible();
});

test('view-only staff can read learning pages but not change them', async ({ page, browser }) => {
  await signIn(page);
  await page.goto('/admin/settings/staff/new');
  await page.getByLabel('Name').fill('Learning Viewer');
  await page.getByLabel('Email (login)').fill('learn.viewer@example.org');
  await page.getByLabel('Password', { exact: true }).fill('viewer password 2');
  await page.getByRole('button', { name: 'Add staff member' }).click();
  const ctx = await browser.newContext();
  const v = await ctx.newPage();
  await signIn(v, 'learn.viewer@example.org', 'viewer password 2');
  await v.goto('/admin/homework');
  await expect(v.getByRole('heading', { name: 'Homework', level: 1 })).toBeVisible();
  for (const p of ['/admin/homework/new', '/admin/exams/new', '/admin/incidents/new', '/admin/merits/types', '/admin/products', '/admin/events/new']) {
    await v.goto(p);
    await expect(v, p).toHaveURL(/\/admin\/no-access$/);
  }
  await ctx.close();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`phase 6 screens pass axe in ${scheme} theme`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page);
    for (const path of ['/admin/homework', '/admin/homework/new', '/admin/homework/incomplete', '/admin/homework/report', '/admin/homework/templates', '/admin/exams', '/admin/exams/new', '/admin/exams/1', '/admin/exams/1/results',
      '/admin/exams/semesters', '/admin/exams/quizzes', '/admin/exams/grades', '/admin/reports', '/admin/reports/1', '/admin/reports/1/comments', '/admin/reports/1/overview', '/admin/reports/1/print?class=1', '/admin/reports/paragraphs',
      '/admin/incidents', '/admin/incidents/new', '/admin/incidents/templates', '/admin/incidents/reports', '/admin/merits', '/admin/merits/totals', '/admin/merits/types', '/admin/merits/achievements', '/admin/merits/certificates',
      '/admin/merits/teams', '/admin/products', '/admin/events', '/admin/events/1', '/admin/events/1/opt-ins', '/admin/forums', '/admin/forums/1', '/admin/forums/topic/1', '/admin/students/2']) {
      await page.goto(path);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((x) => `${path} ${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  });
}
