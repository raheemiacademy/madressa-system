/*
 * Madressa's remote support account: every madrasah gets one super admin with this name and email, so the owner can sign
 * in and fix what's broken. It has no password: when support is needed, the owner dashboard's "Set-password link" makes a
 * one-time link for it. The school sees it in Settings → Admin staff but can't edit or delete it.
 *
 * THE SUPPORT EMAIL — change it here. Every madrasah picks up the new address the next time it starts (deploy/ship.sh).
 * While it's empty, no support account is made.
 */
export const SUPPORT_ADMIN = {
  name: 'Madressa Support',
  email: 'muhammadowaislimbada@gmail.com'
};
