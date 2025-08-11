import { Router } from 'express';
import prisma from '@backend/prismaClient';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';
import { requireMeetingMember } from '@backend/middleware/requireMember';
import { suggestConcise, generatePreQuestions } from '@backend/lib/ai';
import { notifyMember } from '@backend/modules/notification';
import { autoRefreshAgenda } from './agenda.service'; 

export const agendaRouter = Router();

/** 取得（存在しなければ自動作成） */
agendaRouter.get('/:id/agenda', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  let agenda = await prisma.agenda.findUnique({ where: { meetingId } });
  if (!agenda) {
    agenda = await prisma.agenda.create({ data: { meetingId } });
  }
  const items = await prisma.agendaItem.findMany({
    where: { agendaId: agenda.id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ agendaId: agenda.id, items });
});

/** 追加 */
agendaRouter.post('/:id/agenda/items', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const me = (req as any).user.id as string;
  const { text, status, sortOrder } = req.body as { text: string; status?: 'OPEN'|'DECIDED'|'PARKING'; sortOrder?: number };

  const agenda = await prisma.agenda.upsert({
    where: { meetingId },
    update: {},
    create: { meetingId },
  });

  const item = await prisma.agendaItem.create({
    data: {
      agendaId: agenda.id,
      authorId: me,
      text,
      status: (status as any) ?? 'OPEN',
      sortOrder: sortOrder ?? 0,
    },
  });

  // リビジョン保存
  const snapshot = await prisma.agendaItem.findMany({ where: { agendaId: agenda.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  await prisma.agendaRevision.create({ data: { agendaId: agenda.id, snapshot } });

  res.status(201).json(item);
});

/** 更新 */
agendaRouter.patch('/:id/agenda/items/:itemId', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const { itemId } = req.params;
  const { text, status, sortOrder } = req.body as Partial<{ text: string; status: 'OPEN'|'DECIDED'|'PARKING'; sortOrder: number }>;

  const agenda = await prisma.agenda.findUnique({ where: { meetingId } });
  if (!agenda) return res.status(404).json({ error: 'agenda not found' });

  await prisma.agendaItem.update({
    where: { id: itemId },
    data: { text, status: status as any, sortOrder },
  });

  const snapshot = await prisma.agendaItem.findMany({ where: { agendaId: agenda.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  await prisma.agendaRevision.create({ data: { agendaId: agenda.id, snapshot } });

  res.sendStatus(204);
});

/** 差分（前回閲覧以降の変更）— since=ISO を渡すとそれ以降の revisions を返す */
agendaRouter.get('/:id/agenda/diff', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const sinceISO = (req.query.since as string | undefined) ?? '';
  const since = sinceISO ? new Date(sinceISO) : new Date(0);

  const agenda = await prisma.agenda.findUnique({ where: { meetingId } });
  if (!agenda) return res.json({ revisions: [] });

  const revisions = await prisma.agendaRevision.findMany({
    where: { agendaId: agenda.id, createdAt: { gt: since } },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  res.json({ revisions });
});

/** 本音ボタン — 要約提案を返す（反映は別エンドポイントで） */
agendaRouter.post('/:id/honest', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const me = (req as any).user.id as string;
  const { message } = req.body as { message: string };

  const suggested = await suggestConcise(message);
  const thread = await prisma.honestThread.create({
    data: {
      meetingId, memberId: me,
      messages: [{ role: 'user', content: message }],
      suggestedText: suggested, status: 'OPEN',
    },
  });
  res.status(201).json({ threadId: thread.id, suggestedText: suggested });
});

/** 本音ボタン — 提案をアジェンダに反映 */
agendaRouter.post('/:id/honest/:threadId/apply', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const { threadId } = req.params;
  const thread = await prisma.honestThread.findUnique({ where: { id: threadId } });
  if (!thread || thread.meetingId !== meetingId) return res.status(404).json({ error: 'thread not found' });

  const agenda = await prisma.agenda.upsert({
    where: { meetingId },
    update: {},
    create: { meetingId },
  });

  await prisma.agendaItem.create({
    data: { agendaId: agenda.id, text: thread.suggestedText ?? '(no text)', status: 'OPEN', sortOrder: 0 },
  });
  const snapshot = await prisma.agendaItem.findMany({ where: { agendaId: agenda.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  await prisma.agendaRevision.create({ data: { agendaId: agenda.id, snapshot, note: 'applied from honest button' } });

  await prisma.honestThread.update({ where: { id: threadId }, data: { status: 'APPLIED' } });
  res.json({ ok: true });
});

/** 事前質問の自動生成＆送信（主催者のみ推奨だが簡略で全メンバー可） */
agendaRouter.post('/:id/pre-questions', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return res.status(404).json({ error: 'meeting not found' });

  const qs = await generatePreQuestions(meeting.title, meeting.purpose);

  const participants = await prisma.meetingMember.findMany({ where: { meetingId }, select: { memberId: true } });
  await Promise.all(participants.map(async (p) => {
    const q = qs[Math.floor(Math.random() * qs.length)];
    await prisma.preQuestion.create({ data: { meetingId, toMemberId: p.memberId, question: q, sentAt: new Date() } });
    await notifyMember(p.memberId, `事前質問: ${meeting.title}`, q);
  }));

  res.json({ ok: true, count: participants.length });
});

agendaRouter.post('/:id/agenda/refresh', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  await autoRefreshAgenda(req.params.id);
  res.json({ ok: true });
});
