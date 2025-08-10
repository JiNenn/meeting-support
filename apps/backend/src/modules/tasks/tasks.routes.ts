import { Router } from 'express';
import prisma from '@backend/prismaClient';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';
import { requireMeetingMember } from '@backend/middleware/requireMember';
import { pushTaskToGoogle } from './googleTasks.service';

export const tasksRouter = Router();

/** 一覧 */
tasksRouter.get('/:id/tasks', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const rows = await prisma.task.findMany({
    where: { meetingId },
    orderBy: [{ mandatory: 'desc' }, { due: 'asc' }, { createdAt: 'desc' }],
    include: { assignee: { select: { id: true, email: true } } },
  });
  res.json(rows);
});

/** 作成（assigneeEmail を指定すると upsert） */
tasksRouter.post('/:id/tasks', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const { title, description, due, mandatory, assigneeEmail } = req.body as {
    title: string; description?: string; due?: string; mandatory?: boolean; assigneeEmail?: string;
  };
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });

  let assigneeId: string | undefined;
  if (assigneeEmail) {
    const member = await prisma.member.upsert({
      where: { email: assigneeEmail },
      update: {},
      create: { email: assigneeEmail, roleLog: [] },
    });
    assigneeId = member.id;
  }

  const t = await prisma.task.create({
    data: {
      meetingId,
      title: title.trim(),
      description: description?.trim(),
      due: due ? new Date(due) : undefined,
      mandatory: !!mandatory,
      assigneeId,
    },
  });

  res.status(201).json(t);
});

/** 更新（タイトル/説明/期限/担当/必須/状態） */
tasksRouter.patch('/:id/tasks/:taskId', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const { id: meetingId, taskId } = req.params;
  const { title, description, due, mandatory, status, assigneeEmail } = req.body as Partial<{
    title: string; description: string; due: string; mandatory: boolean; status: 'OPEN'|'DONE'; assigneeEmail: string;
  }>;

  let assigneeId: string | undefined;
  if (assigneeEmail) {
    const member = await prisma.member.upsert({
      where: { email: assigneeEmail },
      update: {},
      create: { email: assigneeEmail, roleLog: [] },
    });
    assigneeId = member.id;
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      title, description,
      due: due ? new Date(due) : undefined,
      mandatory,
      status: status as any,
      assigneeId,
    },
  });

  res.sendStatus(204);
});

/** Google Tasks へ送信（ワンクリック） */
tasksRouter.post('/:id/tasks/:taskId/push', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const { taskId } = req.params;
  try {
    const result = await pushTaskToGoogle(taskId);
    if (!result.ok && result.reason === 'no_token') {
      return res.status(202).json({ ok: false, reason: 'assignee_has_no_google_token' });
    }
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? String(e) });
  }
});
