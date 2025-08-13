import { Router } from 'express';
import prisma from '@backend/prismaClient';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';
import { requireOrganizer } from '@backend/middleware/requireOrganizer';
import { suggestMembersForMeeting } from './suggest.service';

export const suggestRouter = Router();

/** 候補取得 */
suggestRouter.get('/:id/suggest-members', ensureAuthenticated, requireOrganizer, async (req, res) => {
  const topReq = Math.min(10, Math.max(0, Number(req.query.topReq ?? 3)));
  const topOpt = Math.min(10, Math.max(0, Number(req.query.topOpt ?? 3)));
  try {
    const s = await suggestMembersForMeeting(req.params.id, topReq, topOpt);
    res.json(s);
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

/** 候補を MeetingMember に反映 */
suggestRouter.post('/:id/apply-suggestion', ensureAuthenticated, requireOrganizer, async (req, res) => {
  const meetingId = req.params.id;
  const body = (req.body ?? {}) as {
    requiredIds?: string[];
    optionalIds?: string[];
    topReq?: number;
    topOpt?: number;
  };

  let requiredIds = Array.isArray(body.requiredIds) ? body.requiredIds : undefined;
  let optionalIds = Array.isArray(body.optionalIds) ? body.optionalIds : undefined;

  // ID未指定ならサーバ側で算出
  if (!requiredIds || !optionalIds) {
    const topReq = Math.min(10, Math.max(0, Number(body.topReq ?? 3)));
    const topOpt = Math.min(10, Math.max(0, Number(body.topOpt ?? 3)));
    const s = await suggestMembersForMeeting(meetingId, topReq, topOpt);
    requiredIds = s.required.map(x => x.memberId);
    optionalIds = s.optional.map(x => x.memberId);
  }

  const toUpsert: { memberId: string; role: 'REQUIRED' | 'OPTIONAL' }[] = [];
  for (const id of (requiredIds ?? [])) toUpsert.push({ memberId: id, role: 'REQUIRED' });
  for (const id of (optionalIds ?? [])) toUpsert.push({ memberId: id, role: 'OPTIONAL' });

  // 既存を確認してから upsert
  const existing = await prisma.meetingMember.findMany({
    where: { meetingId },
    select: { memberId: true },
  });
  const existSet = new Set(existing.map(e => e.memberId));

  const results = [];
  for (const item of toUpsert) {
    // 主催者や既存は upsert でもOKだが、無駄を避ける
    if (existSet.has(item.memberId)) {
      await prisma.meetingMember.update({
        where: { meetingId_memberId: { meetingId, memberId: item.memberId } },
        data: { role: item.role },
      });
      results.push({ memberId: item.memberId, role: item.role, updated: true });
    } else {
      const row = await prisma.meetingMember.upsert({
        where: { meetingId_memberId: { meetingId, memberId: item.memberId } },
        update: { role: item.role },
        create: { meetingId, memberId: item.memberId, role: item.role },
      });
      results.push({ memberId: row.memberId, role: row.role, created: true });
    }
  }

  // 反映後の一覧を返す
  const members = await prisma.meetingMember.findMany({
    where: { meetingId },
    include: { member: { select: { email: true } } },
    orderBy: [{ role: 'asc' }], // REQUIRED→OPTIONAL
  });

  res.json({
    applied: results.length,
    members: members.map(m => ({ memberId: m.memberId, email: m.member.email, role: m.role })),
  });
});
