import { Router } from 'express';
import prisma from '@backend/prismaClient';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';
import { requireMeetingMember } from '@backend/middleware/requireMember';
import { polishText } from '@backend/lib/ai';

export const minutesRouter = Router();

/** 取得（無ければ空で作成） */
minutesRouter.get('/:id/minutes', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  let m = await prisma.minutes.findUnique({ where: { meetingId } });
  if (!m) {
    m = await prisma.minutes.create({ data: { meetingId, content: '' } });
  }
  res.json({ content: m.content, updatedAt: m.updatedAt });
});

/** アップロード（全文置換） */
minutesRouter.post('/:id/minutes', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const me = (req as any).user?.id as string | undefined;
  const { content } = req.body as { content: string };

  const current = await prisma.minutes.upsert({
    where: { meetingId },
    update: {},
    create: { meetingId, content: '' },
  });

  await prisma.minuteEdit.create({
    data: {
      minutesId: current.id,
      authorId: me ?? null,
      note: 'upload',
      oldText: current.content,
      newText: content,
    },
  });

  const updated = await prisma.minutes.update({
    where: { id: current.id },
    data: { content },
  });

  res.status(200).json({ updatedAt: updated.updatedAt });
});

/** ブラッシュアップ（AI整形） */
minutesRouter.post('/:id/minutes/polish', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const me = (req as any).user?.id as string | undefined;

  const m = await prisma.minutes.findUnique({ where: { meetingId } });
  if (!m) return res.status(404).json({ error: 'minutes not found' });

  const newText = await polishText(m.content);

  await prisma.minuteEdit.create({
    data: {
      minutesId: m.id,
      authorId: me ?? null,
      note: 'polish',
      oldText: m.content,
      newText,
    },
  });

  const updated = await prisma.minutes.update({
    where: { id: m.id },
    data: { content: newText },
  });

  res.json({ updatedAt: updated.updatedAt });
});

/** 口述訂正（テキスト差し込み） */
minutesRouter.post('/:id/minutes/correct', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const me = (req as any).user?.id as string | undefined;
  const { note } = req.body as { note: string };

  const m = await prisma.minutes.findUnique({ where: { meetingId } });
  if (!m) return res.status(404).json({ error: 'minutes not found' });

  const newText = (m.content + '\n\n' + `【訂正】${note}`).trim();

  await prisma.minuteEdit.create({
    data: {
      minutesId: m.id,
      authorId: me ?? null,
      note: 'voice-correction',
      oldText: m.content,
      newText,
    },
  });

  const updated = await prisma.minutes.update({
    where: { id: m.id },
    data: { content: newText },
  });

  res.status(200).json({ updatedAt: updated.updatedAt });
});

/** 訂正履歴ビューア */
minutesRouter.get('/:id/minutes/history', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const m = await prisma.minutes.findUnique({ where: { meetingId } });
  if (!m) return res.json({ edits: [] });

  const edits = await prisma.minuteEdit.findMany({
    where: { minutesId: m.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { author: { select: { email: true, id: true } } },
  });

  res.json({ edits });
});
