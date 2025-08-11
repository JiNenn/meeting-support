import { Router } from 'express';
import prisma from '@backend/prismaClient';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';
import { requireOrganizer } from '@backend/middleware/requireOrganizer';
import { randomToken } from '@backend/lib/token';
import { audit } from '@backend/lib/audit';

export const shareRouter = Router();

/** 発行（主催者のみ） */
shareRouter.post('/:id/share', ensureAuthenticated, requireOrganizer, async (req, res) => {
  const meetingId = req.params.id;
  const me = (req as any).user.id as string;
  const { ttlHours } = req.body as { ttlHours?: number };
  const token = randomToken();
  const expiresAt = ttlHours ? new Date(Date.now() + ttlHours*3600*1000) : null;

  const link = await prisma.shareLink.create({
    data: { meetingId, token, expiresAt, createdBy: me },
  });
  await audit(req, meetingId, 'SHARE_ISSUE', { token: link.token, expiresAt });

  res.json({ url: `http://localhost:3000/public/${token}`, expiresAt });
});

/** 失効（主催者のみ） */
shareRouter.delete('/:id/share', ensureAuthenticated, requireOrganizer, async (req, res) => {
  const meetingId = req.params.id;
  await prisma.shareLink.deleteMany({ where: { meetingId } });
  await audit(req, meetingId, 'SHARE_REVOKE');
  res.sendStatus(204);
});

/** 公開取得（認証不要・読み取り専用） */
shareRouter.get('/public/:token', async (req, res) => {
  const link = await prisma.shareLink.findUnique({ where: { token: req.params.token } });
  if (!link) return res.status(404).json({ error: 'not_found' });
  if (link.expiresAt && link.expiresAt < new Date()) return res.status(410).json({ error: 'expired' });

  const meeting = await prisma.meeting.findUnique({
    where: { id: link.meetingId },
    select: {
      id: true, title: true, purpose: true, scheduledAt: true,
      agenda: { select: { id: true, items: { select: { text: true, status: true }, orderBy: [{ sortOrder:'asc' }, { createdAt:'asc' }] } } },
    },
  });
  const minutes = await prisma.minutes.findUnique({ where: { meetingId: link.meetingId }, select: { content: true } });

  res.json({
    id: meeting?.id, title: meeting?.title, purpose: meeting?.purpose, scheduledAt: meeting?.scheduledAt,
    agenda: meeting?.agenda?.items ?? [],
    minutes: minutes?.content ?? '',
  });
});
