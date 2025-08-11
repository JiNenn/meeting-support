import prisma from '@backend/prismaClient';
import { Request } from 'express';

export async function audit(req: Request, meetingId: string, action: string, detail?: any) {
  const actorId = (req as any).user?.id as string | undefined;
  await prisma.auditLog.create({
    data: { meetingId, action: action as any, actorId: actorId ?? null, detail }
  });
}
