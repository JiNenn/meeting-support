import prisma from '@backend/prismaClient';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { isInvalidGrant } from '@backend/lib/googleErrors';
import { getMemberRefreshToken, clearMemberRefreshToken } from '@backend/lib/googleTokens';

const TASKLIST_NAME = process.env.GTASKS_LIST_NAME ?? 'Meeting Support';

async function oauthFor(memberId: string): Promise<OAuth2Client | undefined> {
  const refresh = await getMemberRefreshToken(memberId);
  if (!refresh) return undefined; // ← null は返さない
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
  if (hit) return hit.id!;
  const created = await tasks.tasklists.insert({ requestBody: { title: TASKLIST_NAME } });
  return created.data.id!;
}

export async function pushTaskToGoogle(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignee: true, meeting: true },
  });
  if (!task) throw new Error('task not found');
  if (!task.assigneeId) throw new Error('assignee required to push');

  // まず担当者、ダメなら主催者にフォールバック
  let primaryId = task.assigneeId;
  let fallbackId = task.meeting.organizerId;

  let auth = await oauthFor(primaryId);
  if (!auth) {
    auth = await oauthFor(fallbackId);
    if (!auth) return { ok: false as const, reason: 'needs_relink' as const, who: 'assignee_and_organizer' as const };
    primaryId = fallbackId;
    fallbackId = '';
  }

  const attempt = async (client: OAuth2Client) => {
    const listId = await ensureTaskList(client);
    const tasksApi = google.tasks({ version: 'v1', auth: client });

    const due = task.due ? new Date(task.due).toISOString() : undefined;
    const notes = [
      task.description ?? '',
      `Meeting: ${task.meeting.title} (${task.meetingId})`,
      task.mandatory ? '[Mandatory]' : '[Optional]',
    ].filter(Boolean).join('\n');

    const created = await tasksApi.tasks.insert({
      tasklist: listId,
      requestBody: { title: task.title, notes, due },
    });

    await prisma.task.update({
      where: { id: task.id },
      data: { googleTaskId: created.data.id ?? undefined, googleTaskListId: listId },
    });

    return { ok: true as const, googleTaskId: created.data.id };
  };

  try {
    return await attempt(auth);
  } catch (e) {
    if (isInvalidGrant(e)) {
      await clearMemberRefreshToken(primaryId);

      if (fallbackId) {
        const auth2 = await oauthFor(fallbackId);
        if (!auth2) return { ok: false as const, reason: 'needs_relink' as const, who: 'organizer' as const };
        try {
          return await attempt(auth2);
        } catch (e2) {
          if (isInvalidGrant(e2)) {
            await clearMemberRefreshToken(fallbackId);
            return { ok: false as const, reason: 'needs_relink' as const, who: 'organizer' as const };
          }
          throw e2;
        }
      }
      return { ok: false as const, reason: 'needs_relink' as const, who: 'assignee' as const };
    }
    throw e;
  }
}

