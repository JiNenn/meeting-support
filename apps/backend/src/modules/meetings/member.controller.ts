import prisma from '@backend/prismaClient';
import { Request, Response } from 'express';

/** 招待: emailとrole('REQUIRED'|'OPTIONAL') を受け取り、Memberをupsert→MeetingMemberをupsert */
export async function inviteMember(req: Request, res: Response) {
  const meetingId = req.params.id;
  const { email, role } = req.body as { email: string; role: 'REQUIRED'|'OPTIONAL' };

  if (!email || !role) return res.status(400).json({ error: 'email and role are required' });

  const member = await prisma.member.upsert({
    where: { email },
    update: {},
    create: { email, roleLog: [] },
  });

  await prisma.meetingMember.upsert({
    where: { meetingId_memberId: { meetingId, memberId: member.id } },
    update: { role },
    create: { meetingId, memberId: member.id, role },
  });

  res.status(204).end();
}

/** 取り消し */
export async function removeMember(req: Request, res: Response) {
  const meetingId = req.params.id;
  const memberId = req.params.memberId;

  await prisma.meetingMember.delete({
    where: { meetingId_memberId: { meetingId, memberId } },
  });
  res.status(204).end();
}

/** 参加者一覧（役割付） */
export async function listMembers(req: Request, res: Response) {
  const meetingId = req.params.id;
  const rows = await prisma.meetingMember.findMany({
    where: { meetingId },
    include: { member: { select: { id: true, email: true } } },
    orderBy: [{ role: 'asc' }, { memberId: 'asc' }],
  });
  res.json(rows.map(r => ({ memberId: r.memberId, email: r.member.email, role: r.role })));
}

// apps/backend/src/modules/meetings/member.controller.ts
export async function updateMemberRole(req: Request, res: Response) {
  const meetingId = req.params.id;
  const memberId  = req.params.memberId;
  const { role }  = req.body as { role: 'REQUIRED'|'OPTIONAL' };
  await prisma.meetingMember.update({
    where: { meetingId_memberId: { meetingId, memberId } },
    data:  { role },
  });
  res.sendStatus(204);
}

