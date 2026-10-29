import { expect, test } from '@playwright/test';
import { signIn } from './sign-in';

test('a failed save keeps what was typed and marks only the wrong field', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/students/new');
  await page.getByLabel('First name').fill('Yusuf');
  await page.getByLabel('General notes').fill('Allergic to nuts');
  await page.getByRole('button', { name: 'Add student' }).click();
  await expect(page.getByText('Add a surname')).toBeVisible();
  await expect(page.getByLabel('First name')).toHaveValue('Yusuf');
  await expect(page.getByLabel('General notes')).toHaveValue('Allergic to nuts');
  await expect(page.getByLabel('First name')).not.toHaveAttribute('aria-invalid', 'true');
});
