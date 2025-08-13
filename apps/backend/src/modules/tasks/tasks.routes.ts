import { Router } from 'express';
import prisma from '@backend/prismaClient';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';
import { requireMeetingMember } from '@backend/middleware/requireMember';
import { pushTaskToGoogle } from './googleTasks.service';

export const tasksRouter = Router();

// 先頭かファイル内どこかに共通関数（POST でも使えます）
const parseDue = (v: unknown): Date | undefined => {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') { const d = new Date(v); return isNaN(d.getTime()) ? undefined : d; }
  if (typeof v === 'string')  { const d = new Date(v); return isNaN(d.getTime()) ? undefined : d; }
  return undefined;
};

// 更新（タイトル/説明/期限/担当/必須/状態）+ push=true で即同期（create or update）
tasksRouter.patch('/:id/tasks/:taskId', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const taskId    = req.params.taskId;

  const { title, description, due, mandatory, status, assigneeEmail, push } = req.body as Partial<{
    title: string; description: string; due: string | number; mandatory: boolean; status: 'OPEN'|'DONE'; assigneeEmail: string; push: boolean;
  }>;

  //（任意）この会議に属するタスクかチェックして 404 を早期返却
  const exists = await prisma.task.findUnique({ where: { id: taskId }, select: { meetingId: true } });
  if (!exists || exists.meetingId !== meetingId) {
    return res.status(404).json({ error: 'task_not_found' });
  }

  // assigneeEmail → Member upsert
  let assigneeId: string | undefined | null = undefined;
  if (assigneeEmail !== undefined) {
    if (assigneeEmail === '' || assigneeEmail === null) {
      assigneeId = null; // 担当外し
    } else {
      const member = await prisma.member.upsert({
        where: { email: assigneeEmail },
        update: {},
        create: { email: assigneeEmail, roleLog: [] },
      });
      assigneeId = member.id;
    }
  }

  // due を安全に解釈
  const dueDate = due === undefined ? undefined : parseDue(due);
  if (due !== undefined && !dueDate) {
    return res.status(400).json({ error: 'invalid_due', hint: 'Use ISO8601 (e.g. 2025-08-15T09:00:00.000Z) or epoch ms' });
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      title:       title?.trim(),
      description: description?.trim(),
      due:         dueDate,
      mandatory,
      status:      status as any,
      assigneeId,  // undefined: 変更なし / null: 担当外し / string: 指定
    },
    include: { assignee: { select: { id: true, email: true } } },
  });

  let pushResult: any = null;
  if (push === true) {
    try {
      pushResult = await pushTaskToGoogle(updated.id);  // 既に googleTaskId があれば update に回る
    } catch (e: any) {
      pushResult = { ok: false, reason: 'error', message: e?.message ?? String(e) };
    }
  }

  return res.status(200).json({ task: updated, pushResult });
});


// 一覧
tasksRouter.get('/:id/tasks', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const rows = await prisma.task.findMany({
    where: { meetingId },
    orderBy: [{ mandatory: 'desc' }, { due: 'asc' }, { createdAt: 'desc' }],
    include: { assignee: { select: { id: true, email: true } } },
  });
  res.json(rows);
});

// ★ 作成（レスポンスまで実装）
tasksRouter.post('/:id/tasks', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const { title, description, due, mandatory, assigneeEmail, push } = req.body as {
    title: string; description?: string; due?: string; mandatory?: boolean; assigneeEmail?: string; push?: boolean;
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

  const created = await prisma.task.create({
    data: {
      meetingId,
      title: title.trim(),
      description: description?.trim(),
      due: due ? new Date(due) : undefined,
      mandatory: !!mandatory,
      assigneeId,
      status: 'OPEN',
    },
    include: { assignee: { select: { id: true, email: true } } },
  });

  let pushResult: any = null;
  if (push === true) {
    try {
      pushResult = await pushTaskToGoogle(created.id);
    } catch (e: any) {
      pushResult = { ok: false, reason: 'error', message: e?.message ?? String(e) };
    }
  }

  return res.status(201).json({ task: created, pushResult });
});

// 更新（必要なら既存のままでOK）

/** Google Tasks へ送信（ワンクリック） */
tasksRouter.post('/:id/tasks/:taskId/push', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  try {
    const r = await pushTaskToGoogle(req.params.taskId);
    if (r.ok) return res.json(r);

    if (r.reason === 'relink_required' || r.reason === 'no_token') {
      return res.status(428).json({ error: r.reason, who: (r as any).who });
    }
    if (r.reason === 'api_disabled') {
      return res.status(503).json({ error: 'api_disabled', message: r.message });
    }
    return res.status(502).json({ error: 'push_failed', message: r.message });
  } catch (e: any) {
    const msg = e?.response?.data?.error?.message || e?.message || String(e);
    return res.status(502).json({ error: msg });
  }
});

