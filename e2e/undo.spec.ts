import { expect, test } from '@playwright/test';
import { signIn } from './sign-in';

test('removing a timetable session can be undone for 5 seconds, then happens', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/classes');
  await page.getByRole('link', { name: 'Test Class C' }).first().click();
  const remove = page.getByRole('button', { name: /^Remove the Monday 17:00 session$/ });
  await remove.click();
  await expect(page.getByRole('status').filter({ hasText: 'Session removed.' })).toBeVisible();
  await expect(remove).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(remove).toBeVisible();
  await page.waitForTimeout(6000);
  await page.reload();
  await expect(remove).toBeVisible(); // undone: nothing was sent

  await remove.click();
  await page.waitForTimeout(6000);
  await page.reload();
  await expect(remove).toHaveCount(0);
});

test('a delete that can’t be undone asks in the page, says what goes, and Cancel keeps it', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/classes');
  await page.getByRole('link', { name: 'Test Class C' }).first().click();
  await page.getByRole('button', { name: 'Delete class' }).click();
  const dlg = page.getByRole('dialog', { name: /^Delete Test Class C\?$/ });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: /Test Class C/ })).toBeVisible();
});
