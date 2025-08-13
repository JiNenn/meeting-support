import prisma from '@backend/prismaClient';
import { Request, Response, NextFunction } from 'express';

export async function requireOrganizer(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const meetingId = req.params.id;
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return res.status(404).json({ error: 'meeting not found' });
  if (meeting.organizerId !== user.id) return res.status(403).json({ error: 'forbidden' });
  return next();
}
