/* The "Set up your madrasah" steps (dashboard checklist and the step banner). Each href takes ?setup=N so the page shows where you are. */

export const STEPS = [
  { key: 'details', title: 'Madrasah details', why: 'Your name, address, logo and contact details. They appear on letters, receipts, emails and the parent app.', href: '/admin/settings/profile?setup=1', more: null },
  { key: 'year', title: 'School year and holidays', why: 'The dates of your year, and the half-terms and holidays when there are no classes, so registers and fees skip them.', href: '/admin/settings/years?setup=2', more: ['/admin/settings/holidays?setup=2', 'Holidays'] },
  { key: 'classes', title: 'Classes and teachers', why: 'Add your teachers, then your classes with their days and times. Students are put into classes in the next step.', href: '/admin/classes/new?setup=3', more: ['/admin/teachers/new?setup=3', 'Add a teacher'] },
  { key: 'students', title: 'Students and parents', why: 'Import everyone at once from your own spreadsheet or old system (we match the columns and show you a preview first), or add them one by one.', href: '/admin/import/students?setup=4', more: ['/admin/students/new?setup=4', 'Add one by one'] },
  { key: 'fees', title: 'Fees', why: 'How much you charge and how often. Invoices are then made for you each month. Skip this if your madrasah doesn’t charge fees.', href: '/admin/fees/structure?setup=5', more: null, optional: true },
  { key: 'invite', title: 'Invite parents and teachers', why: 'Give every parent and teacher with an email address a login, and email them a link to choose their password and install the app.', href: '/admin/tools/portals?setup=6#invite', more: null, optional: true }
] as const;
export type StepKey = (typeof STEPS)[number]['key'];
