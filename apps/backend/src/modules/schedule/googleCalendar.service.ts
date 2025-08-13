/* apps/backend/src/modules/schedule/googleCalendar.service.ts */
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import prisma from '@backend/prismaClient';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

/** service‐account Key から JWT クライアントを生成 */
function getJwtClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
  return new JWT({ keyFile, scopes: SCOPES, subject: undefined }); // subject は委任時のみ使用
}

export async function fetchBusySlots(
  emails: string[],
  timeMin: Date,
  timeMax: Date,
) {
  // ❶ サービスアカウントで認証
  const auth = getJwtClient();
  const calendar = google.calendar({ version: 'v3', auth });

  // ❷ freebusy 呼び出し
  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: emails.map(e => ({ id: e })),
    },
  });

  return (data.calendars ?? {}) as Record<
    string,
    { busy?: { start: string; end: string }[] }
  >;
}
