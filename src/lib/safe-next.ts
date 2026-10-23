/** Only same-portal relative paths, so ?next= can't send someone off-site or back to the login page. */
export function safeNext(portal: string, next: unknown) {
  return typeof next === 'string' && (next === `/${portal}` || next.startsWith(`/${portal}/`) || next.startsWith(`/${portal}?`))
    && !next.includes('\\') && !next.startsWith(`/${portal}/login`)
    ? next : `/${portal}`;
}
