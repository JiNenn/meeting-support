import prisma from '@backend/prismaClient';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { isInvalidGrant } from '@backend/lib/googleErrors';
import { getMemberRefreshToken, clearMemberRefreshToken } from '@backend/lib/googleTokens';

const TASKLIST_NAME = process.env.GTASKS_LIST_NAME ?? 'Meeting Support';

function tasksWriteEnabled() {
  return process.env.TASKS_WRITE === 'true';
}

async function oauthFor(memberId: string): Promise<OAuth2Client | undefined> {
  const refresh = await getMemberRefreshToken(memberId);
  if (!refresh) return undefined;
  const o = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_CALLBACK_URL!,
  );
  o.setCredentials({ refresh_token: refresh });
  return o;
}

async function ensureTaskList(auth: OAuth2Client): Promise<string> {
  const tasks = google.tasks({ version: 'v1', auth });
  const lists = await tasks.tasklists.list({ maxResults: 100 });
  const hit = (lists.data.items ?? []).find(l => l.title === TASKLIST_NAME);
  if (hit?.id) return hit.id;
  const created = await tasks.tasklists.insert({ requestBody: { title: TASKLIST_NAME } });
  return created.data.id!;
}

type PushResult =
  | { ok: true; listId: string; taskId: string; used: 'assignee' | 'organizer' }
  | { ok: false; reason: 'no_token' | 'relink_required' | 'api_disabled' | 'error'; message?: string; who?: 'assignee' | 'organizer' | 'assignee_and_organizer' };

export async function pushTaskToGoogle(taskId: string): Promise<PushResult> {
  if (!tasksWriteEnabled()) {
    return { ok: false, reason: 'error', message: 'TASKS_WRITE=false' };
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignee: true, meeting: { select: { id: true, title: true, organizerId: true } } },
  });
  if (!task) return { ok: false, reason: 'error', message: 'task not found' };

  // auth 選択：assignee → (必要なら) organizer
  let used: 'assignee' | 'organizer' | undefined;
  let usedMemberId: string | undefined;
  let auth: OAuth2Client | undefined;

  if (task.assigneeId) {
    auth = await oauthFor(task.assigneeId);
    if (auth) { used = 'assignee'; usedMemberId = task.assigneeId; }
  }
  if (!auth && process.env.TASKS_FALLBACK_TO_ORGANIZER === 'true') {
    const a2 = await oauthFor(task.meeting.organizerId);
    if (a2) { auth = a2; used = 'organizer'; usedMemberId = task.meeting.organizerId; }
  }

  if (!auth) {
    const who = task.assigneeId ? (process.env.TASKS_FALLBACK_TO_ORGANIZER === 'true' ? 'assignee_and_organizer' : 'assignee') : 'organizer';
    return { ok: false, reason: 'no_token', who };
  }

  const tasksApi = google.tasks({ version: 'v1', auth });
  const listId = await ensureTaskList(auth);

  // マッピング
  const dueIso = task.due ? new Date(task.due).toISOString() : undefined;
  const body: any = {
    title: task.title,
    notes: [
      task.description ?? '',
      `Meeting: ${task.meeting.title} (${task.meetingId})`,
      task.mandatory ? '[Mandatory]' : '[Optional]',
    ].filter(Boolean).join('\n'),
    due: dueIso,
    status: task.status === 'DONE' ? 'completed' : 'needsAction',
  };
  if (task.status === 'DONE') body.completed = new Date().toISOString();

  try {
    // update or create
    if (task.googleTaskId) {
      await tasksApi.tasks.patch({
        tasklist: task.googleTaskListId || listId,
        task: task.googleTaskId,
        requestBody: body,
      });
      // listId が空だった場合は保存しておく
      if (!task.googleTaskListId) {
        await prisma.task.update({
          where: { id: task.id },
          data: { googleTaskListId: listId },
        });
      }
      return { ok: true, listId: task.googleTaskListId || listId, taskId: task.googleTaskId, used: used! };
    } else {
      const created = await tasksApi.tasks.insert({ tasklist: listId, requestBody: body });
      const gid = created.data.id!;
      await prisma.task.update({
        where: { id: task.id },
        data: { googleTaskId: gid, googleTaskListId: listId },
      });
      return { ok: true, listId, taskId: gid, used: used! };
    }
  } catch (e: any) {
    const msg = e?.response?.data?.error?.message || e?.message || String(e);

    // API未有効
    if (msg.includes('tasks.googleapis.com') || msg.includes('is not enabled') || msg.includes('has not been used in project')) {
      return { ok: false, reason: 'api_disabled', message: msg };
    }

    // トークン失効 → 該当ユーザーのトークンをクリアして relink_required
    if (isInvalidGrant(e)) {
      if (usedMemberId) await clearMemberRefreshToken(usedMemberId);
      return { ok: false, reason: 'relink_required', message: 'invalid_grant', who: used };
    }

    return { ok: false, reason: 'error', message: msg };
  }
}