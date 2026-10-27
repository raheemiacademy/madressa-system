import { createHmac, randomBytes } from 'node:crypto';

/*
 * Authenticator codes (TOTP, RFC 6238): HMAC-SHA1, 6 digits, 30-second steps — what every authenticator app does by default.
 * Built on Node's crypto so the owner sign-in needs no new package.
 */
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;

export function base32(buf: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ABC[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return bits ? out + ABC[(value << (5 - bits)) & 31] : out;
}

export function fromBase32(s: string) {
  const bytes: number[] = [];
  let bits = 0, value = 0;
  for (const ch of s.toUpperCase().replace(/[\s=-]/g, '')) {
    const i = ABC.indexOf(ch);
    if (i < 0) throw new Error('Not base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

/** 160 random bits, the size RFC 4226 recommends, as base32 for typing into an app. */
export const newSecret = () => base32(randomBytes(20));

export function hotp(secret: string, counter: number, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', fromBase32(secret)).update(msg).digest();
  const off = h[h.length - 1]! & 15;
  const bin = (h.readUInt32BE(off) & 0x7fffffff) % 10 ** digits;
  return String(bin).padStart(digits, '0');
}

export const stepAt = (now: Date) => Math.floor(now.getTime() / 1000 / STEP_SECONDS);

/**
 * The step a code belongs to, allowing one step either side for a phone clock that's slightly out, or null.
 * A step at or before `lastStep` was already used, so it's refused too.
 */
export function matchStep(secret: string, code: string, now: Date, lastStep: number | null) {
  if (!/^\d{6}$/.test(code)) return null;
  const t = stepAt(now);
  for (const s of [t, t - 1, t + 1]) if ((lastStep === null || s > lastStep) && hotp(secret, s) === code) return s;
  return null;
}

/** The link an authenticator app on the same phone opens to add the key. */
export const otpauthUrl = (secret: string, email: string) =>
  `otpauth://totp/${encodeURIComponent(`Madressa Owner:${email}`)}?secret=${secret}&issuer=${encodeURIComponent('Madressa Owner')}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;

/** The key in groups of four, easier to type. */
export const groupKey = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();
