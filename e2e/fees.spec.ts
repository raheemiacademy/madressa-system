import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './sign-in';


test('fees dashboard, then record a payment with Add fees and see it on the student’s fees', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Fees', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Fees', level: 1 })).toBeVisible();
  await expect(page.getByText('Overdue invoices')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Totals by type' }).getByRole('cell', { name: 'Fees', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Add fees' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Add fees' });
  await dlg.getByLabel('Find a student').fill('Student 002');
  await dlg.getByRole('button', { name: /Test Student 002/ }).click();
  await expect(dlg.getByLabel('Pay towards')).toBeVisible();
  await dlg.getByLabel('Amount (£)').fill('5');
  await dlg.getByLabel('Method').selectOption('Cash');
  await dlg.getByRole('button', { name: 'Record payment' }).click();
  await expect(dlg.getByRole('status').filter({ hasText: 'Payment recorded.' })).toBeVisible();
  await dlg.getByRole('button', { name: 'Close' }).click();

  await page.goto('/admin/fees/student/2');
  await expect(page.getByRole('heading', { name: 'Test Student 002: fees', level: 1 })).toBeVisible();
  await expect(page.getByRole('cell', { name: '£5', exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Report view' }).click();
  await expect(page.getByRole('region', { name: 'Statement' })).toBeVisible();
  await page.goto('/admin/settings/audits');
  await expect(page.getByRole('cell', { name: /Recorded £5 Cash \(Cleared\) for Test Student 002/ }).first()).toBeVisible();
});

test('generating twice never duplicates; force generate and bulk delete need the school name', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/fees/generate');
  const normal = page.locator('form').filter({ hasText: 'Generate missing invoices' }).first();
  await normal.getByRole('button', { name: 'Generate missing invoices now' }).click();
  await expect(normal.getByRole('status')).toContainText('already existed');
  await normal.getByRole('button', { name: 'Generate missing invoices now' }).click();
  await expect(normal.getByRole('status')).toContainText(/^0 invoices created; \d+ already existed\./);

  const force = page.locator('#force form');
  await force.getByLabel('Type the school name to confirm').fill('Not the school');
  await force.getByRole('button', { name: 'Force generate invoices' }).click();
  await expect(force.getByText('Type the school name exactly as it appears in the school profile')).toBeVisible();

  await page.goto('/admin/fees/delete');
  await page.getByLabel('Invoice date from').fill('2000-01-01');
  await page.getByLabel('Invoice date to').fill('2000-01-31');
  await page.getByLabel('Type the school name to confirm').fill('nope');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Type the school name exactly as it appears in the school profile')).toBeVisible();
});

test('create an ad hoc structure with the period editor and apply it to a student', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/fees/structure/new?kind=adhoc');
  await page.getByLabel('Structure name').fill('Sample books fee');
  await page.getByLabel('Name', { exact: true }).fill('Books');
  await page.getByLabel('Amount per invoice (£)').fill('8.50');
  await expect(page.getByText('Annual total per student: £8.50')).toBeVisible();
  await page.getByRole('button', { name: 'Create structure' }).click();
  await expect(page).toHaveURL(/\/admin\/fees\/structure$/);
  await expect(page.getByRole('link', { name: 'Sample books fee' })).toBeVisible();

  await page.goto('/admin/fees/student/3');
  await page.getByLabel('Ad hoc structure').selectOption({ label: 'Sample books fee' });
  await page.getByRole('button', { name: 'Create invoices' }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 invoice created.' })).toBeVisible();
  // React resets the form after a successful action, so choose the structure again.
  await page.getByLabel('Ad hoc structure').selectOption({ label: 'Sample books fee' });
  await page.getByRole('button', { name: 'Create invoices' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'These invoices already exist for this student.' })).toBeVisible();
});

test('staff without Access Fees Area can’t reach fees pages or the webhook secrets', async ({ page, request }) => {
  await signIn(page, 'clerk@example.org');
  await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Fees' })).toHaveCount(0);
  for (const p of ['/admin/fees', '/admin/fees/student/2', '/admin/fees/generate', '/admin/fees/structure/new', '/admin/fees/delete']) {
    await page.goto(p);
    await expect(page, p).toHaveURL(/\/admin\/no-access$/);
  }
  const csv = await page.request.get('/admin/fees/annual/export');
  expect(csv.status()).toBe(404);
  await page.goto('/admin/students');
  await expect(page.getByRole('link', { name: /^Fees of / })).toHaveCount(0);
  // No webhook secret configured in tests: the endpoint refuses rather than trusting the payload.
  expect((await request.post('/api/webhooks/stripe', { data: '{}' })).status()).toBe(404);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`phase 4 screens pass axe in ${scheme} theme`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page);
    for (const path of ['/admin/fees', '/admin/fees/student/2', '/admin/fees/student/2?view=report', '/admin/fees/invoice?student=2', '/admin/fees/annual', '/admin/fees/annual?by=students',
      '/admin/fees/generate', '/admin/fees/monthly', '/admin/fees/query?go=1', '/admin/fees/overview', '/admin/fees/direct-debits', '/admin/fees/bank-transfers', '/admin/fees/receipts',
      '/admin/fees/reminders', '/admin/fees/adjustments', '/admin/fees/sibling-discounts', '/admin/fees/family?student=2', '/admin/fees/contributions', '/admin/fees/contributions/new',
      '/admin/fees/structure', '/admin/fees/structure/1', '/admin/fees/modify', '/admin/fees/import', '/admin/fees/diagnose', '/admin/fees/delete', '/admin/fees/receipt/1', '/admin/settings/gateways']) {
      await page.goto(path);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((x) => `${path} ${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
    await page.goto('/admin/fees');
    await page.getByRole('button', { name: 'Add fees' }).first().click();
    const r = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations.map((x) => x.id)).toEqual([]);
  });
}
