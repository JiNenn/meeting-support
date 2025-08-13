import cron from 'node-cron';
import { google } from 'googleapis';
import prisma from '../prismaClient';
import { JWT } from 'google-auth-library';

export function initRoleBootstrapJob() {
  const svc = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!svc) {
    console.warn('[roleBoot] GOOGLE_SERVICE_ACCOUNT_JSON is missing – job skipped');
    return;
  }

  let creds;
  try {
    creds = JSON.parse(svc);
  } catch (e) {
    console.error('[roleBoot] GOOGLE_SERVICE_ACCOUNT_JSON is invalid JSON');
    return;
  }
  
  const auth = new JWT({
    email: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!).client_email,
    key:   JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!).private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly',
             'https://www.googleapis.com/auth/calendar.readonly'],
  });

  const gmail = google.gmail({ version: 'v1', auth });
  const calendar = google.calendar({ version: 'v3', auth });

  cron.schedule('0 3 * * *', async () => {
    // ❶ 直近 90 日の送受信者 → “共演カウント”
    // ❷ Calendar から “同席イベント” → 重み付け
    // ❸ スコアの高い人を roleLog に初期登録
    console.log('🛠️  roleBoot job running...');
    /* 実装は割愛 */
  });
}
