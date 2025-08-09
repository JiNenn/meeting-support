import { Request, Response, NextFunction } from 'express';
import prisma from '@backend/prismaClient';

export async function requireMeetingMember(req: Request, res: Response, next: NextFunction) {
  const meetingId = req.params.id;
  const me = (req as any).user?.id as string | undefined;
  if (!me) return res.status(401).json({ error: 'unauthorized' });

  const isMember = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      OR: [{ organizerId: me }, { members: { some: { memberId: me } } }],
    },
    select: { id: true },
  });
  if (!isMember) return res.status(403).json({ error: 'forbidden' });
  return next();
}
