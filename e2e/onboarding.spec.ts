import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { PW, signIn } from './sign-in';

test('the setup page closes once a madrasah has its first admin', async ({ page }) => {
  await page.goto('/admin/setup');
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('welcome, setup checklist, step banner, hide and show again', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin?welcome=1');
  const welcome = page.getByRole('dialog', { name: /Assalamu alaikum/ });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Look around first' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const card = page.getByRole('region', { name: /Set up your madrasah|Your madrasah is set up/ });
  await expect(card).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute('aria-valuemax', '6');
  await page.goto('/admin/settings/profile?setup=1');
  await expect(page.getByText('Setup step 1 of 6: Madrasah details.')).toBeVisible();
  await page.goto('/admin');
  await card.getByRole('button', { name: /Hide for now|Close/ }).click();
  await expect(card).toHaveCount(0);
  await page.goto('/admin/tools/system');
  await page.getByRole('button', { name: 'Show the setup steps on the dashboard' }).click();
  await page.goto('/admin');
  await expect(card).toBeVisible();
});

test('step 6 invites parents and teachers, and the step ticks itself off', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/tools/portals?setup=6');
  await expect(page.getByText('Setup step 6 of 6: Invite parents and teachers.')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Invite parents and teachers' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Done: / })).toBeVisible();
  await page.goto('/admin');
  const invite = page.getByRole('region', { name: /Set up your madrasah|Your madrasah is set up/ }).getByRole('listitem').filter({ hasText: 'Invite parents and teachers' });
  await expect(invite).toHaveAttribute('data-state', 'done');
});

test('only super admins see the setup checklist', async ({ browser }) => {
  const ctx = await browser.newContext();
  const clerk = await ctx.newPage();
  await signIn(clerk, 'clerk@example.org', PW);
  await expect(clerk.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(clerk.getByRole('region', { name: /Set up your madrasah|Your madrasah is set up/ })).toHaveCount(0);
  await ctx.close();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`welcome and checklist pass axe in ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page);
    for (const path of ['/admin?welcome=1', '/admin', '/admin/settings/profile?setup=1', '/admin/tools/portals?setup=6']) {
      await page.goto(path);
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((x) => `${path} ${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  });
}
