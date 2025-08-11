import crypto from 'crypto';
export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url'); // URL-safe
}
