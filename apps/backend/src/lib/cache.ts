// apps/backend/src/lib/cache.ts
import NodeCache from 'node-cache';
const ttl = Number(process.env.FREEBUSY_TTL_SEC ?? 300); // 5分
export const cache = new NodeCache({ stdTTL: ttl, useClones: false });

export function k(...parts: (string|number)[]) {
  return parts.join('|');
}
