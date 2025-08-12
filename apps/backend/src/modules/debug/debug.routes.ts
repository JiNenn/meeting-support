import { Router, Request, Response } from 'express';
import prisma from '@backend/prismaClient';
import { getMemberRefreshToken } from '@backend/lib/googleTokens';
import { freeBusy } from '@backend/modules/schedule/calendar.service';

export const debugRouter = Router();

debugRouter.get(
  '/debug/meeting/:id/google',
  async (req: Request, res: Response) => {
    const mId = req.params.id;
    const members = await prisma.meetingMember.findMany({
      where: { meetingId: mId },
      include: { member: { select: { id: true, email: true } } },
      orderBy: [{ role: 'asc' }, { memberId: 'asc' }],
    });

    const rows = await Promise.all(
      members.map(async (mm) => {
        const has = (await getMemberRefreshToken(mm.member.id)) != null;
        return { email: mm.member.email, role: mm.role, hasRefresh: has };
      }),
    );

    res.json(rows);
  },
);

/**
 * （任意）各メンバーの busy 件数を可視化
 * GET /api/debug/meeting/:id/freebusy
 */
debugRouter.get(
  '/debug/meeting/:id/freebusy',
  async (req: Request, res: Response) => {
    const mId = req.params.id;
    const mm = await prisma.meetingMember.findMany({
      where: { meetingId: mId },
      select: { memberId: true },
    });
    const ids = [...new Set(mm.map((x) => x.memberId))];

    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 7);

    const fb = await freeBusy(ids, from, to); // { memberId: [{start,end}, ...] }
    const out = Object.fromEntries(
      Object.entries(fb).map(([id, slots]) => [id, { busyCount: slots.length }]),
    );
    res.json(out);
  },
);