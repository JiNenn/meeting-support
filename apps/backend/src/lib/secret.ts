import crypto from 'crypto';

/** 32-byte key を生成（不足時はSHA-256で引き伸ばし） */
function deriveKey(raw: string) {
  const buf = Buffer.from(raw, 'utf8');
  return buf.length === 32 ? buf : crypto.createHash('sha256').update(buf).digest();
}

/** 返却は "enc.v1.<ivB64>.<tagB64>.<ctB64>" */
export function seal(plain: string): string {
  const key = deriveKey(process.env.OAUTH_ENC_KEY || '');
  if (!key) throw new Error('OAUTH_ENC_KEY missing');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc.v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ct.toString('base64url')}`;
}

export function open(blob: string): string {
  if (!blob.startsWith('enc.v1.')) return blob; // 後方互換（平文も読み出せる）
  const key = deriveKey(process.env.OAUTH_ENC_KEY || '');
  const [, , ivB64, tagB64, ctB64] = blob.split('.');
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const ct = Buffer.from(ctB64, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
