import type { Metadata, Viewport } from 'next';

// MARKETING_SITE is read per request (not baked in at build): only the copy serving the main domain shows the marketing pages.
export const isMarketing = () => process.env.MARKETING_SITE === '1';

const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 34 34'%3E%3Crect width='34' height='34' rx='8' fill='%231C2147'/%3E%3Crect x='9' y='9' width='16' height='16' rx='2' fill='%2384CEEB'/%3E%3Crect x='9' y='9' width='16' height='16' rx='2' fill='%2384CEEB' transform='rotate(45 17 17)'/%3E%3Ccircle cx='17' cy='17' r='4' fill='%231C2147'/%3E%3C/svg%3E";

/** A marketing page's title, description and icon; nothing on a madrasah's own copy. */
export const marketingMetadata = (title: string, description: string): Metadata =>
  isMarketing() ? { title: { absolute: title }, description, robots: { index: true, follow: true }, icons: { icon: ICON } } : {};

export async function generateViewport(): Promise<Viewport> {
  // eslint-disable-next-line no-restricted-syntax -- meta tag needs a literal; matches the marketing pages' --ink
  return isMarketing() ? { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1C2147', colorScheme: 'light' } : {};
}
