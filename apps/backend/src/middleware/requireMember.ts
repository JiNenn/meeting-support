// apps/backend/src/middleware/requireMember.ts
import prisma from '@backend/prismaClient';
import { Request, Response, NextFunction } from 'express';

export async function requireMeetingMember(req: Request, res: Response, next: NextFunction) {
  const meetingId = req.params.id;
  const me = (req as any).user?.id as string | undefined;
  if (!me) return res.status(401).json({ error: 'unauthorized' });

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
  if (!meeting) return res.status(404).json({ error: 'meeting_not_found' });

  const mm = await prisma.meetingMember.findUnique({
    where: { meetingId_memberId: { meetingId, memberId: me } },
    select: { memberId: true },
  });
  if (!mm) return res.status(403).json({ error: 'forbidden_not_a_member' });

  return next();
}
