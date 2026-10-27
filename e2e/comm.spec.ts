import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import postgres from 'postgres';
import { signIn } from './sign-in';

const sql = postgres(process.env.DATABASE_URL_TEST!, { max: 1, onnotice: () => {} });
test.afterAll(() => sql.end());

test('compose to a class, read the reply state, then reply and lock', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/messages/new');
  await page.getByRole('group', { name: /Or a class/ }).getByLabel('Test Class A').check();
  await page.getByLabel('Subject').fill('Sample trip letter');
  await page.getByRole('textbox', { name: 'Message' }).fill('Please bring a packed lunch.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/messages$/);
  const first = page.getByRole('link', { name: /Sample trip letter/ }).first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page.getByRole('heading', { name: 'Sample trip letter', level: 2 })).toBeVisible();
  await expect(page.getByText('Not yet read').first()).toBeVisible();
  await expect(page.getByText('Delivered').first()).toBeAttached(); // grey ticks on our message
  await page.getByLabel('Reply').fill('A reminder for tomorrow.');
  await page.getByRole('button', { name: 'Reply & lock' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Reply sent and conversation locked.' })).toBeVisible();
  await page.getByRole('link', { name: 'Locked (archived)' }).click();
  await expect(page.getByRole('link', { name: /Sample trip letter/ }).first()).toBeVisible();
});

test('messages: search bar with a filter, delete one message, and live counts', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/messages/new');
  await page.getByRole('group', { name: /Or a class/ }).getByLabel('Test Class B').check();
  await page.getByLabel('Subject').fill('Sample delete check');
  await page.getByRole('textbox', { name: 'Message' }).fill('This one will be deleted.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/messages$/);
  await page.getByRole('searchbox', { name: 'Search messages' }).fill('delete check');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=delete\+check/);
  // Sending to a class makes one conversation per family; delete the only message in one of them.
  const threads = page.getByRole('link', { name: /Sample delete check/ });
  const before = await threads.count();
  await threads.first().click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Delete this message from/ }).first().click();
  await expect(page.getByText('Choose a conversation to read it.')).toBeVisible(); // its only message went, so the conversation did too
  await expect(threads).toHaveCount(before - 1);
  await expect(page.getByRole('combobox', { name: 'Filter by teacher or contact' })).toBeVisible();
  const counts = await (await page.request.get('/admin/api/badges')).json();
  expect(counts).toEqual({ messages: expect.any(Number), notifications: expect.any(Number) });
});

test('outstanding fees: remind each family on WhatsApp with the amount written in', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/fees/reminders?show=all');
  await page.getByText('Remind families on WhatsApp').click();
  const first = page.getByRole('list', { name: 'Remind families on WhatsApp' }).getByRole('link').first();
  await expect(first).toHaveAttribute('href', /^https:\/\/wa\.me\/44\d+\?text=Salaam%20.*%C2%A3\d/);
});

test('newsletter: write, preview, send a test, and see it on the mail queue', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/newsletters/new');
  await page.getByLabel('Subject').fill('Sample autumn newsletter');
  await page.getByRole('textbox', { name: 'Newsletter' }).fill('Dear families, term starts soon.');
  await page.getByRole('button', { name: 'Create newsletter' }).click();
  await expect(page.getByRole('heading', { name: 'Sample autumn newsletter', level: 1 })).toBeVisible();
  await expect(page.frameLocator('iframe[title="Newsletter preview"]').getByText('term starts soon')).toBeVisible();
  await page.getByRole('button', { name: 'Send a test to me' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Test queued to admin@example.org.' })).toBeVisible();
  await page.goto('/admin/settings/mail-queue');
  await expect(page.getByRole('cell', { name: '[Test] Sample autumn newsletter' })).toBeVisible();
});

test('WhatsApp: each parent gets an Open WhatsApp button with the message, and opened rows tick off', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/whatsapp');
  await page.getByLabel('Who').selectOption('currentPrimary');
  await page.getByRole('button', { name: 'Show the list' }).click();
  const message = page.getByRole('textbox', { name: 'Message' });
  await expect(message).toHaveValue('Salaam {NAME}, ');
  await message.fill('Salaam {NAME}, class is cancelled today.');
  await page.getByRole('button', { name: 'Show the list' }).click();
  const list = page.getByRole('list', { name: /^WhatsApp/ });
  const first = list.getByRole('link').first();
  await expect(first).toHaveAttribute('href', /^https:\/\/wa\.me\/44\d+\?text=Salaam%20\w+%2C%20class%20is%20cancelled%20today\.$/);
  await expect(page.getByText(/^0 of \d+ opened in WhatsApp$/)).toBeVisible();
  const popup = page.waitForEvent('popup');
  await first.click();
  await (await popup).close(); // wa.me opens in a new tab
  await expect(page.getByText(/^1 of \d+ opened in WhatsApp$/)).toBeVisible();
  await expect(list.getByRole('link', { name: /\(opened\)$/ })).toHaveCount(1);
});

test('SMS: queue texts to a group and see them in the logs; templates editor previews', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/sms');
  await page.getByLabel('Send to').selectOption('currentPrimary');
  await page.getByRole('textbox', { name: 'Message' }).fill('{SCHOOL_NAME}: hello {NAME}');
  await page.getByRole('button', { name: 'Queue texts' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Queued \d+ texts/ })).toBeVisible();
  await page.goto('/admin/sms/logs');
  await expect(page.getByRole('cell', { name: 'Sample Academy: hello Sample Parent 001' })).toBeVisible();

  await page.goto('/admin/settings/templates/fees.receipt');
  await page.getByLabel('Subject').fill('Thank you: receipt {RECEIPT_NO}');
  await page.getByRole('button', { name: 'Save template' }).click();
  await expect(page.getByText('Subject: Thank you: receipt [receipt no]')).toBeVisible();
  await page.getByRole('button', { name: 'Reset to built-in text' }).click();
});

test('an admin can copy a set-password link (no email needed) and the parent uses it to sign in', async ({ page, browser }) => {
  await signIn(page);
  await page.goto('/admin/contacts/new');
  await page.getByLabel('Name', { exact: true }).fill('Linked Parent Example');
  await page.getByLabel('Email (parent portal login)').fill('linked.parent@example.org');
  await page.getByLabel('Mobile', { exact: true }).fill('07700 900555');
  await page.getByRole('button', { name: 'Add contact' }).click();
  await expect(page.getByText('linked.parent@example.org: invited, no password yet')).toBeVisible();
  await page.getByRole('button', { name: 'Get a set-password link' }).click();
  const field = page.getByRole('textbox', { name: /Send this to Linked Parent Example/ });
  await expect(field).toHaveValue(/\/parent\/set-password\/[A-Za-z0-9_-]+$/);
  await expect(page.getByRole('link', { name: 'Send on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/447700900555\?text=Salaam%20Linked%20Parent%20Example/);
  const path = new URL(await field.inputValue()).pathname;

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(path);
  await p.getByLabel('New password').fill('linked parent pw 1');
  await p.getByLabel('Type it again').fill('linked parent pw 1');
  await p.getByRole('button', { name: 'Save and sign in' }).click();
  await expect(p).toHaveURL(/\/parent$/);
  await ctx.close();
});

test('an invited teacher gets a set-password link on first sign-in and uses it once', async ({ page, browser }) => {
  await signIn(page);
  await page.goto('/admin/teachers/new');
  await page.getByLabel('Full name').fill('Invited Teacher Example');
  await page.getByLabel('Email (portal login)').fill('invited.teacher@example.org');
  await page.getByRole('button', { name: 'Add teacher' }).click();
  await expect(page.getByText('invited.teacher@example.org: invited, no password yet')).toBeVisible();

  const ctx = await browser.newContext();
  const t = await ctx.newPage();
  await t.goto('/teacher/login');
  await t.getByLabel('Email').fill('invited.teacher@example.org');
  await t.getByLabel('Password').fill('anything');
  await t.getByRole('button', { name: 'Sign in' }).click();
  await expect(t.getByRole('status')).toContainText('we’ve sent you a link to set your password');
  const [mail] = await sql<{ html: string }[]>`select html from mail_queue where to_email = 'invited.teacher@example.org' order by id desc limit 1`;
  const path = /\/teacher\/set-password\/[A-Za-z0-9_-]+/.exec(mail!.html)![0];
  await t.goto(path);
  await t.getByLabel('New password').fill('invited teacher pw 1');
  await t.getByLabel('Type it again').fill('invited teacher pw 1');
  await t.getByRole('button', { name: 'Save and sign in' }).click();
  await expect(t).toHaveURL(/\/teacher$/);
  await t.goto(path);
  await expect(t.getByRole('heading', { name: 'Link expired' })).toBeVisible();
  await ctx.close();
  await page.reload();
  await expect(page.getByText(/invited\.teacher@example\.org: email confirmed/)).toBeVisible();
});

test('print layouts download as real PDFs; staff without Marketing or Send SMS are refused', async ({ page, browser }) => {
  await signIn(page);
  const pdf = await page.request.get('/admin/pdf?path=%2Fadmin%2Ffees%2Freceipt%2F1');
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
  expect((await page.request.get('/admin/pdf?path=https%3A%2F%2Fexample.org%2F')).status()).toBe(404);

  const ctx = await browser.newContext();
  const c = await ctx.newPage();
  await signIn(c, 'clerk@example.org');
  await expect(c.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'WhatsApp' })).toHaveCount(0);
  for (const p of ['/admin/whatsapp', '/admin/newsletters', '/admin/newsletters/new', '/admin/sms', '/admin/sms/logs', '/admin/settings/mail-queue', '/admin/settings/templates']) {
    await c.goto(p);
    await expect(c, p).toHaveURL(/\/admin\/no-access$/);
  }
  await c.goto('/admin/messages');
  await expect(c.getByRole('heading', { name: 'Messages', level: 1 })).toBeVisible();
  await ctx.close();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`phase 5 screens pass axe in ${scheme} theme`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page);
    for (const path of ['/admin/messages', '/admin/messages/new', '/admin/messages/delete', '/admin/newsletters', '/admin/newsletters/new', '/admin/newsletters/files', '/admin/sms', '/admin/sms/templates', '/admin/whatsapp?group=currentPrimary',
      '/admin/sms/logs', '/admin/settings/mail-queue', '/admin/settings/templates', '/admin/settings/templates/fees.reminder', '/admin/settings/sms', '/admin/contacts/1', '/admin/teachers/1',
      '/teacher/set-password', '/teacher/login']) {
      await page.goto(path);
      // The sandboxed preview frame runs no scripts, so axe would wait for it forever; it's excluded (it has a title).
      const r = await new AxeBuilder({ page }).exclude('iframe.ra-preview').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((x) => `${path} ${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  });
}
