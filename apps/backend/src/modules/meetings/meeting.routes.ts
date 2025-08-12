// apps/backend/src/modules/meetings/meeting.routes.ts
import prisma from '@backend/prismaClient';
import { Router } from 'express';
import { createMeeting, getMeeting, finalizeMeeting } from './meeting.controller';
import { inviteMember, removeMember, listMembers, updateMemberRole } from './member.controller';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';
import { requireOrganizer } from '@backend/middleware/requireOrganizer';
import { rankCandidates } from '@backend/modules/schedule/ranking.algorithm';
import { setPreference } from './preference.controller';
import { createIcs } from './meetingIcs.controller';
import { updateMeetingSchema } from './meeting.schemas';
import { validate } from '@backend/middleware/validate';
import { createMeetingSchema, inviteSchema } from './meeting.schemas';
import { audit } from '@backend/lib/audit';


export const meetingRouter = Router();

// ★ デバッグ用 一覧（存在確認）
meetingRouter.get('/', ensureAuthenticated, async (req, res) => {
  const me = (req as any).user.id as string;
  const rows = await prisma.meeting.findMany({
    where: {
      OR: [
        { organizerId: me },
        { members: { some: { memberId: me } } },
      ],
    },
    select: { id: true, title: true, purpose: true, scheduledAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(rows);
});

// 新規作成（認証必須に）
meetingRouter.post('/', ensureAuthenticated, createMeeting);
meetingRouter.post('/', validate(createMeetingSchema), createMeeting);

// 詳細
meetingRouter.get('/:id', ensureAuthenticated, getMeeting);

meetingRouter.patch('/:id',
  ensureAuthenticated, requireOrganizer, validate(updateMeetingSchema),
  async (req, res) => {
    const upd = await prisma.meeting.update({
      where: { id: req.params.id },
      data: req.body,
      select: { id:true, title:true, purpose:true, durationMinutes:true, updatedAt:true }
    });
    res.json(upd);
  }
);

// メンバー操作（主催者のみ）
meetingRouter.get('/:id/members',  ensureAuthenticated, requireOrganizer, listMembers);
meetingRouter.post('/:id/members', ensureAuthenticated, requireOrganizer, inviteMember);
meetingRouter.post('/:id/members',
  ensureAuthenticated, requireOrganizer, validate(inviteSchema), inviteMember);
meetingRouter.patch('/:id/members/:memberId', ensureAuthenticated, requireOrganizer, updateMemberRole);
meetingRouter.delete('/:id/members/:memberId', ensureAuthenticated, requireOrganizer, removeMember);

// 候補（認証必須）
meetingRouter.get('/:id/candidates', async (req, res) => {
  const meetingId = req.params.id;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { durationMinutes: true, scheduledAt: true }
  });

  const start = new Date(meeting!.scheduledAt!);
  const end   = new Date(start.getTime() + (meeting?.durationMinutes ?? 60) * 60000);

  const duration = meeting?.durationMinutes ?? 60; // ★

  const members = await prisma.meetingMember.findMany({ where: { meetingId } });
  const reqIds = members.filter(m => m.role === 'REQUIRED').map(m => m.memberId);
  const optIds = members.filter(m => m.role !== 'REQUIRED').map(m => m.memberId);


  const cand = await rankCandidates(reqIds, optIds, start, end, duration); // ★
  res.json(cand.slice(0, 10));
});


// 監査ログの閲覧（主催者のみ）
meetingRouter.get('/:id/logs', ensureAuthenticated, requireOrganizer, async (req, res) => {
  const rows = await prisma.auditLog.findMany({
    where: { meetingId: req.params.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { actor: { select: { id: true, email: true } } }
  });
  res.json(rows);
});


// 希望登録（認証必須）
meetingRouter.patch('/:id/candidates', ensureAuthenticated, setPreference);

// 確定（主催者のみ）
meetingRouter.post('/finalize/:id', ensureAuthenticated, requireOrganizer, finalizeMeeting);

meetingRouter.get('/:id/ics', createIcs);
