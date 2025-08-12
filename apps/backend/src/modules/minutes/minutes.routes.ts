import { Router } from 'express';
import prisma from '@backend/prismaClient';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';
import { requireMeetingMember } from '@backend/middleware/requireMember';
import { polishText } from '@backend/lib/ai';
import { getAI } from '@backend/lib/ai.factory';

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

  const existing = await prisma.minutes.findUnique({ where: { meetingId } });
  const current = existing ?? await prisma.minutes.create({ data: { meetingId, content: '' } });

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

// プロンプトだけ返す
minutesRouter.post('/:id/minutes/polish/prompt', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const m = await prisma.minutes.findUnique({ where: { meetingId } });
  if (!m) return res.status(404).json({ error:'minutes not found' });

  const ai = getAI();
  const r  = await ai.polishText(m.content);
  if (!r.prompt) return res.status(200).json({ mode:'auto', note:'auto mode available' });
  res.json({ mode:'manual', prompt: r.prompt });
});

// 手動反映（貼り付け結果を保存）
minutesRouter.post('/:id/minutes/polish/manual-apply', ensureAuthenticated, requireMeetingMember, async (req, res) => {
  const meetingId = req.params.id;
  const me = (req as any).user?.id as string | undefined;
  const { content } = req.body as { content: string };

  const cur = await prisma.minutes.findUnique({ where: { meetingId } });
  if (!cur) return res.status(404).json({ error:'minutes not found' });

  await prisma.minuteEdit.create({
    data: { minutesId: cur.id, authorId: me ?? null, note:'polish-manual', oldText: cur.content, newText: content }
  });
  const upd = await prisma.minutes.update({ where: { id: cur.id }, data: { content } });
  res.json({ updatedAt: upd.updatedAt });
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
