// apps/backend/src/modules/schedule/calendar.service.ts
import { google } from 'googleapis';
import { isInvalidGrant } from '@backend/lib/googleErrors';
import {
  getMemberRefreshToken,
  clearMemberRefreshToken,
} from '@backend/lib/googleTokens';

/** リフレッシュトークンから OAuth2Client を作る。無ければ null */
async function oauth(memberId: string) {
  const refresh = await getMemberRefreshToken(memberId);
  if (!refresh) return null;
  const o = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_CALLBACK_URL!,
  );
  o.setCredentials({ refresh_token: refresh });
  return o;
}

/** 極小プロセス内キャッシュ（60秒） */
const memCache = new Map<string, { at: number; data: { start: string; end: string }[] }>();
const TTL_MS = 60_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 指定メンバーそれぞれの busy 配列を返す
 * 返り値: { [memberId]: {start,end}[] }
 */
export async function freeBusyForMembers(
  memberIds: string[],
  timeMin: Date,
  timeMax: Date,
) {
  const byMember: Record<string, { start: string; end: string }[]> = {};
  const baseReq = {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    items: [{ id: 'primary' as const }],
  };

  for (const id of memberIds) {
    const cacheKey = `${id}:${baseReq.timeMin}:${baseReq.timeMax}`;
    const hit = memCache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) {
      byMember[id] = hit.data;
      continue;
    }

    const auth = await oauth(id);
    if (!auth) {
      // トークン無し → 空き扱い
      byMember[id] = [];
      memCache.set(cacheKey, { at: Date.now(), data: [] });
      continue;
    }

    const cal = google.calendar({ version: 'v3', auth });

    let lastErr: any;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await cal.freebusy.query({ requestBody: baseReq });
        const busy = r.data.calendars?.primary?.busy ?? [];
        const data = busy.map((b) => ({ start: b.start!, end: b.end! }));
        byMember[id] = data;
        memCache.set(cacheKey, { at: Date.now(), data });
        if (attempt > 0) console.warn(`[freebusy] recovered on retry for member=${id}`);
        lastErr = undefined;
        break;
      } catch (e: any) {
        if (isInvalidGrant(e)) {
          // 自己回復：invalid_grant → トークン削除して空き扱い
          console.warn(`[freebusy] invalid_grant → clear token, member=${id}`);
          await clearMemberRefreshToken(id);
          byMember[id] = [];
          memCache.set(cacheKey, { at: Date.now(), data: [] });
          lastErr = undefined;
          break;
        }
        const status = e?.response?.status ?? 0;
        const retriable = status >= 500 || status === 429;
        if (retriable && attempt === 0) {
          await sleep(300 + Math.random() * 300);
          lastErr = e;
          continue;
        }
        lastErr = e;
        break;
      }
    }

    if (lastErr) {
      // 丸落ちさせたくなければ throw をコメントアウトして空き扱いにする
      throw lastErr;
    }
  }

  return byMember;
}

/** 後方互換：旧名で呼んでいる箇所があっても動くように */
export const freeBusy = freeBusyForMembers;

/** [s,e) の区間に重なりが無ければ true */
export function isFree(
  busy: { start: string; end: string }[],
  start: Date,
  end: Date,
) {
  const s = +start,
    e = +end;
  return !busy.some(
    (b) => !(new Date(b.end).getTime() <= s || new Date(b.start).getTime() >= e),
  );
}
