// apps/backend/src/modules/meetings/preference.controller.ts
import prisma from '@backend/prismaClient';
import { Request, Response } from 'express';

export async function setPreference(req: Request, res: Response) {
  console.log('PREF user=', req.user, 'body=', req.body);

  // ★ 暫定フォールバック（開発中のみ）
  const memberId = (req.user as any)?.id ?? 'dev';

  const meetingId = req.params.id;
  const { start, preference } = req.body;
  if (!start || !preference) {
    return res.status(400).json({ error: 'start & preference required' });
  }

  await prisma.meetingMember.upsert({
    where: { meetingId_memberId: { meetingId, memberId } },
    update: { preference, preferredStart: new Date(start) },
    create: {
      meetingId, memberId,
      role: 'REQUIRED',
      preference,
      preferredStart: new Date(start),
    },
  });

  res.sendStatus(204);
}
