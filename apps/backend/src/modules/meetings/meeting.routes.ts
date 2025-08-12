import prisma from '@backend/prismaClient';
import { Router } from 'express';
import { createMeeting, getMeeting, finalizeMeeting } from './meeting.controller';
import { inviteMember, removeMember, listMembers, updateMemberRole } from './member.controller';
import { upsertMeetingEvent } from '@backend/modules/schedule/calendarWrite.service';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';
import { requireOrganizer } from '@backend/middleware/requireOrganizer';
import { rankCandidates } from '@backend/modules/schedule/ranking.algorithm';
import { setPreference } from './preference.controller';
import { createIcs } from './meetingIcs.controller';
import { createMeetingSchema, inviteSchema, updateMeetingSchema } from './meeting.schemas';
import { validate } from '@backend/middleware/validate';
import { audit } from '@backend/lib/audit';
import { z } from 'zod';

export const meetingRouter = Router();

/** 一覧（自分が主催 or メンバーの会議） */
meetingRouter.get('/', ensureAuthenticated, async (req, res) => {
  const me = (req as any).user.id as string;
  const rows = await prisma.meeting.findMany({
    where: { OR: [{ organizerId: me }, { members: { some: { memberId: me } } }] },
    select: { id: true, title: true, purpose: true, scheduledAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(rows);
});

/** 新規作成 */
meetingRouter.post('/', ensureAuthenticated, validate(createMeetingSchema), createMeeting);

/** 詳細 */
meetingRouter.get('/:id', ensureAuthenticated, getMeeting);

/** 会議属性の更新（主催者のみ） */
meetingRouter.patch(
  '/:id',
  ensureAuthenticated,
  requireOrganizer,
  validate(updateMeetingSchema),
  async (req, res) => {
    const upd = await prisma.meeting.update({
      where: { id: req.params.id },
      data: req.body,
      select: { id: true, title: true, purpose: true, durationMinutes: true, updatedAt: true },
    });
    res.json(upd);
  }
);

/** 主催者の移譲（主催者のみ） */
const transferSchema = z.object({ newOrganizerEmail: z.string().email().max(320) });
meetingRouter.patch(
  '/:id/organizer',
  ensureAuthenticated,
  requireOrganizer,
  validate(transferSchema),
  async (req, res) => {
    const meetingId = req.params.id;
    const { newOrganizerEmail } = req.body as { newOrganizerEmail: string };

    const newOrg = await prisma.member.upsert({
      where: { email: newOrganizerEmail },
      update: {},
      create: { email: newOrganizerEmail, roleLog: [] },
    });

    const updated = await prisma.meeting.update({
      where: { id: meetingId },
      data: { organizerId: newOrg.id },
      select: { id: true, organizerId: true },
    });

    await prisma.meetingMember.upsert({
      where: { meetingId_memberId: { meetingId, memberId: newOrg.id } },
      update: { role: 'REQUIRED' },
      create: { meetingId, memberId: newOrg.id, role: 'REQUIRED' },
    });

    await audit(req as any, meetingId, 'MEMBER_ROLE_UPDATE', { organizerTransferredTo: newOrganizerEmail });
    res.json(updated);
  }
);

/** メンバー操作（主催者のみ） */
meetingRouter.get('/:id/members', ensureAuthenticated, requireOrganizer, listMembers);
meetingRouter.post('/:id/members', ensureAuthenticated, requireOrganizer, validate(inviteSchema), inviteMember);
meetingRouter.patch('/:id/members/:memberId', ensureAuthenticated, requireOrganizer, updateMemberRole);
meetingRouter.delete('/:id/members/:memberId', ensureAuthenticated, requireOrganizer, removeMember);

/** 候補（未確定のみ返す／確定済みは204）★この1本だけに統一 */
meetingRouter.get('/:id/candidates', ensureAuthenticated, async (req, res) => {
  const meetingId = req.params.id;

  const mtg = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { durationMinutes: true, scheduledAt: true },
  });
  if (!mtg) return res.status(404).json({ error: 'not_found' });
  if (mtg.scheduledAt) return res.sendStatus(204); // 確定済みは候補なし

  const duration = mtg.durationMinutes ?? 60;

  // クエリ整形
  const toNum = (v: unknown, def: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };
  const daysParam    = toNum(req.query.days, 7);
  const startHourRaw = toNum(req.query.startHour, 9);
  const endHourRaw   = toNum(req.query.endHour, 18);
  const stepParam    = toNum(req.query.stepMin, 30);
  const weekdaysOnly = String(req.query.weekdaysOnly ?? 'true').toLowerCase() !== 'false';

  // サニタイズ
  const days    = Math.max(1, Math.min(30, daysParam));
  const startH  = Math.max(0, Math.min(23, startHourRaw));
  const endH    = Math.max(startH + 1, Math.min(24, endHourRaw));
  const stepMin = [15, 30, 60].includes(stepParam) ? stepParam : 30;

  // 期間（“いま → +days日”）
  const from = new Date();
  const to   = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

  // 参加者
  const members = await prisma.meetingMember.findMany({ where: { meetingId } });
  const reqIds = members.filter(m => m.role === 'REQUIRED').map(m => m.memberId);
  const optIds = members.filter(m => m.role !== 'REQUIRED').map(m => m.memberId);

  const cand = await rankCandidates(
    reqIds,
    optIds,
    from,
    to,
    duration,
    { stepMin, startHour: startH, endHour: endH, weekdaysOnly }
  );

  res.json(cand.slice(0, 20));
});

/** 希望登録（認証必須） */
meetingRouter.patch('/:id/candidates', ensureAuthenticated, setPreference);

meetingRouter.post('/finalize/:id', finalizeMeeting);

/** 確定（主催者のみ） */
meetingRouter.post('/finalize/:id', ensureAuthenticated, requireOrganizer, finalizeMeeting);

/** カレンダー手動同期（主催者のみ） */
meetingRouter.post('/:id/calendar-sync', ensureAuthenticated, requireOrganizer, async (req, res) => {
  const id = req.params.id;
  const mtg = await prisma.meeting.findUnique({ where: { id }, select: { scheduledAt: true }});
  if (!mtg?.scheduledAt) return res.status(400).json({ error: 'not scheduled' });

  const r = await upsertMeetingEvent(id);
  return res.status(r.ok ? 200 : 502).json({ calendarWrite: r });
});

/** ICS */
meetingRouter.get('/:id/ics', createIcs);
