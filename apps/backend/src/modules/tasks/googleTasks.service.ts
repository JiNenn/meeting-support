import prisma from '@backend/prismaClient';
import { google } from 'googleapis';

const TASKLIST_NAME = process.env.GTASKS_LIST_NAME ?? 'Meeting Support';

async function getOAuthForMember(memberId: string) {
  const m = await prisma.member.findUnique({ where: { id: memberId } });
  if (!m?.googleRefresh) return null;

  const oAuth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_CALLBACK_URL!,
  );
  oAuth2.setCredentials({ refresh_token: m.googleRefresh });
  return oAuth2;
}

async function ensureTaskList(auth: any) {
  const tasks = google.tasks({ version: 'v1', auth });
  const lists = await tasks.tasklists.list({ maxResults: 100 });
  const hit = (lists.data.items ?? []).find(l => l.title === TASKLIST_NAME);
  if (hit) return hit.id!;
  const created = await tasks.tasklists.insert({ requestBody: { title: TASKLIST_NAME } });
  return created.data.id!;
}

// apps/backend/src/modules/tasks/googleTasks.service.ts
export async function pushTaskToGoogle(taskId: string, opts?: { fallbackToOrganizer?: boolean }) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignee: true, meeting: true },
  });
  if (!task) throw new Error('task not found');

  // 1) 担当者トークン
  let auth = task.assigneeId ? await getOAuthForMember(task.assigneeId) : null;

  // 2) フォールバック：担当者なし/トークンなし → 主催者のトークン
  const allowFallback = opts?.fallbackToOrganizer !== false;
  if (!auth && allowFallback) {
    auth = await getOAuthForMember(task.meeting.organizerId);
  }
  if (!auth) return { ok: false as const, reason: 'no_token' as const };

  const listId = await ensureTaskList(auth);
  const tasks = google.tasks({ version: 'v1', auth });

  const due = task.due ? new Date(task.due).toISOString() : undefined;
  const notes = [
    task.description ?? '',
    `Meeting: ${task.meeting.title} (${task.meetingId})`,
    task.mandatory ? '[Mandatory]' : '[Optional]',
  ].filter(Boolean).join('\n');

  const created = await tasks.tasks.insert({
    tasklist: listId,
    requestBody: { title: task.title, notes, due },
  });

  await prisma.task.update({
    where: { id: task.id },
    data: { googleTaskId: created.data.id ?? undefined, googleTaskListId: listId },
  });

  return { ok: true as const, googleTaskId: created.data.id };
}

