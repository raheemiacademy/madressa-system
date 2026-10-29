import { expect, type Page } from '@playwright/test';
import postgres from 'postgres';

export const PW = process.env.SEED_ADMIN_PASSWORD!;
const url = process.env.DATABASE_URL_TEST ?? '';
const sql = /\/school_test(\?|$)/.test(url) ? postgres(url, { max: 1, onnotice: () => {} }) : null;

/**
 * Signs in through the real login form. The login rate limit counts every attempt (30 per 15 minutes), which the
 * whole suite exceeds, so the throwaway test database's counters are cleared first. Lockout tests don't use this.
 */
export async function signIn(page: Page, email = 'admin@example.org', password = PW, portal = 'admin') {
  if (!sql) throw new Error('DATABASE_URL_TEST must point at school_test');
  await sql`delete from rate_limit`;
  await page.goto(`/${portal}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/${portal}$`));
}
