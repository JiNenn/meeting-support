import { Router } from 'express';
import prisma from '@backend/prismaClient';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';

export const demoRouter = Router();
const on = process.env.DEMO_MODE === 'true';

demoRouter.post('/demo/reset', ensureAuthenticated, async (req, res) => {
  if (!on) return res.status(403).json({ error: 'disabled' });
  await prisma.meetingMember.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.agendaItem.deleteMany({});
  await prisma.agendaRevision.deleteMany({});
  await prisma.agenda.deleteMany({});
  await prisma.minutes.deleteMany({});
  await prisma.meeting.deleteMany({});
  res.json({ ok: true });
});

demoRouter.post('/demo/seed', ensureAuthenticated, async (req, res) => {
  if (!on) return res.status(403).json({ error: 'disabled' });

  const me = (req as any).user?.id as string;
  const my = await prisma.member.findUnique({ where: { id: me } });
  if (!my) return res.status(401).json({ error: 'no_user' });

  const m = await prisma.meeting.create({
    data: {
      title: 'ハッカソン・デモ会議',
      purpose: '完成版の流れ確認',
      organizerId: me,
      durationMinutes: 60,
      members: {
        create: [
          { memberId: me, role: 'REQUIRED' },
        ],
      },
    },
  });

  const agenda = await prisma.agenda.create({ data: { meetingId: m.id } });
  await prisma.agendaItem.createMany({
    data: [
      { agendaId: agenda.id, text: '目的共有とスコープ確認', status: 'OPEN', sortOrder: 1 },
      { agendaId: agenda.id, text: 'デモ手順のリハーサル', status: 'OPEN', sortOrder: 2 },
    ],
  });
  await prisma.minutes.create({ data: { meetingId: m.id, content: '（ここに議事録）' } });
  await prisma.task.createMany({
    data: [
      { meetingId: m.id, title: '登壇PC準備', mandatory: true, status: 'OPEN' },
      { meetingId: m.id, title: '再同意フローの確認', mandatory: false, status: 'OPEN' },
    ],
  });

  res.json({ id: m.id });
});
