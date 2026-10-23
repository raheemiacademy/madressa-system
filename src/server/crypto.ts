import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** 32 bytes as 64 hex characters, or base64 (the form Render's generated secrets take). */
export function parseKey(raw: string): Buffer {
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const b = /^[A-Za-z0-9+/_-]{43}=?$/.test(raw) ? Buffer.from(raw, 'base64') : Buffer.alloc(0);
  if (b.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, as 64 hex characters or base64');
  return b;
}

const key = () => parseKey(process.env.DATA_ENCRYPTION_KEY ?? '');

/** AES-256-GCM. Output: base64url(iv | tag | ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}

export function decrypt(enc: string): string {
  const buf = Buffer.from(enc, 'base64url');
  const d = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}
