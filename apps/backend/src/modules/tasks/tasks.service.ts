import prisma from '@backend/prismaClient';
import { google } from 'googleapis';
import { getMemberRefreshToken } from '@backend/lib/googleTokens';

type PushResult =
  | { ok: true; listId: string; taskId: string; used: 'assignee' | 'organizer' }
  | { ok: false; reason: 'no_token' | 'relink_required' | 'api_disabled' | 'error'; message?: string };

function oauthFromRefresh(refresh: string) {
  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_CALLBACK_URL!,
  );
  oauth.setCredentials({ refresh_token: refresh });
  return oauth;
}

async function chooseAuth(assigneeId: string | null, organizerId: string) {
  // 1) 担当者のtoken
  if (assigneeId) {
    const r = await getMemberRefreshToken(assigneeId);
    if (r) return { refresh: r, used: 'assignee' as const, usedMemberId: assigneeId };
  }
  // 2) 主催者にフォールバック
  if (process.env.TASKS_FALLBACK_TO_ORGANIZER === 'true') {
    const r = await getMemberRefreshToken(organizerId);
    if (r) return { refresh: r, used: 'organizer' as const, usedMemberId: organizerId };
  }
  return { refresh: null, used: null, usedMemberId: null } as const;
}

/** Task を Google Tasks に create/update する（@default リスト） */
export async function pushToGoogleTasks(taskId: string): Promise<PushResult> {
  if (process.env.TASKS_WRITE !== 'true') {
    return { ok: false, reason: 'error', message: 'TASKS_WRITE=false' };
  }

  // Task + meeting(organizer) を取得
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    include: { meeting: { select: { organizerId: true } } },
  });
  if (!t) return { ok: false, reason: 'error', message: 'task not found' };

  const { refresh, used, usedMemberId } = await chooseAuth(t.assigneeId, t.meeting.organizerId);
  if (!refresh) return { ok: false, reason: 'no_token' };

  const auth = oauthFromRefresh(refresh);
  const tasks = google.tasks({ version: 'v1', auth });

  // マッピング
  const dueIso = t.due ? new Date(t.due).toISOString() : undefined;
  const reqBody: any = {
    title: t.title,
    notes: [t.description || '', `Meeting ID: ${t.meetingId}`].filter(Boolean).join('\n'),
    due: dueIso, // RFC3339
    status: t.status === 'DONE' ? 'completed' : 'needsAction',
  };
  if (t.status === 'DONE') reqBody.completed = new Date().toISOString();

  const listId = t.googleTaskListId || '@default';

  try {
    if (t.googleTaskId) {
      // update（patch）
      await tasks.tasks.patch({
        tasklist: listId,
        task: t.googleTaskId,
        requestBody: reqBody,
      });
      return { ok: true, listId, taskId: t.googleTaskId, used: used! };
    } else {
      // create
      const created = await tasks.tasks.insert({
        tasklist: listId,
        requestBody: reqBody,
      });
      const gid = created.data.id!;
      await prisma.task.update({
        where: { id: t.id },
        data: { googleTaskId: gid, googleTaskListId: listId },
      });
      return { ok: true, listId, taskId: gid, used: used! };
    }
  } catch (e: any) {
    const msg = e?.response?.data?.error?.message || e?.message || String(e);

    // API 未有効
    if (msg.includes('has not been used in project') || msg.includes('is not enabled')) {
      return { ok: false, reason: 'api_disabled', message: msg };
    }

    // トークン失効 → relink_required（担当者に失効が起きた場合は担当者を、fallbackなら主催者をクリア）
    if (String(msg).includes('invalid_grant')) {
      if (usedMemberId) {
        await prisma.member.update({ where: { id: usedMemberId }, data: { googleAccess: null, googleRefresh: null } });
      }
      return { ok: false, reason: 'relink_required', message: 'invalid_grant' };
    }

    return { ok: false, reason: 'error', message: msg };
  }
}
