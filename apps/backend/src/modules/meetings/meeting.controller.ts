// apps/backend/src/modules/meetings/meeting.controller.ts
import { Request, Response } from 'express';
import prisma from '@backend/prismaClient';
import { sendMeetingNotification } from '@backend/modules/notification/gmail.service';
import { upsertMeetingEvent } from '@backend/modules/schedule/calendarWrite.service';
import { audit } from '@backend/lib/audit';

// 既存 createMeeting ---------------------------------
export const createMeeting = async (req: Request, res: Response) => {
  console.log('BODY', req.body);     // ← 追加
  console.log('USER', req.user);     // ← 追加
  const { title, purpose } = req.body;
  const organizerId = (req.user as any).id;

  const meeting = await prisma.meeting.create({
    data: {
      title, purpose, organizerId
    },
  });
  await prisma.meetingMember.upsert({
    where: { meetingId_memberId: { meetingId: meeting.id, memberId: organizerId } },
    update: { role: 'REQUIRED' },
    create: { meetingId: meeting.id, memberId: organizerId, role: 'REQUIRED' },
  });
  await audit(req, meeting.id, 'MEETING_CREATE', { title: meeting.title, purpose: meeting.purpose });

  res.status(201).json(meeting);
};

export const getMeeting = async (req: Request, res: Response) => {
  const id = req.params.id;
  const m = await prisma.meeting.findUnique({
    where: { id },
    include: {
      organizer: { select: { id: true, email: true } },
      members: {
        include: { member: { select: { id: true, email: true } } },
        orderBy: [{ role: 'asc' }, { memberId: 'asc' }],
      },
    },
  });
  if (!m) return res.status(404).json({ error: 'not found' });

  res.json({
    id: m.id,
    title: m.title,
    purpose: m.purpose,
    scheduledAt: m.scheduledAt,
    organizer: m.organizer,
    members: m.members.map(mm => ({
      memberId: mm.memberId,
      email: mm.member.email,
      role: mm.role,
      preference: mm.preference,
      preferredStart: mm.preferredStart,
    })),
  });
};


export const finalizeMeeting = async (req: Request, res: Response) => {
  const meetingId = req.params.id;
  const { id } = req.params;

  /* ❶ preference 集計 */
  const prefs = await prisma.meetingMember.findMany({
    where: { meetingId, preferredStart: { not: null } },
    select: { preferredStart: true, preference: true },
  });
  if (!prefs.length) return res.status(400).json({ error: 'no preferences' });

  const score: Record<string, number> = {};
  for (const p of prefs) {
    const key = p.preferredStart!.toISOString();
    const delta = p.preference === 'ACCEPT' ? 3 : p.preference === 'MAYBE' ? 1 : 0;
    score[key] = (score[key] ?? 0) + delta;
  }
  const [bestISO] = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  const bestDate = new Date(bestISO);

  /* ❷ Meeting を更新 */
  const meeting = await prisma.meeting.update({
    where: { id: meetingId },
    data:  { scheduledAt: bestDate },
  });

  /* ❸ 必須参加者へ通知 */
  const participants = await prisma.meetingMember.findMany({
    where: { meetingId, role: 'REQUIRED' },
  });
  const updated = await prisma.meeting.update({
    where: { id },
    data: { /* 既存の scheduledAt 設定処理があるなら残す */ },
  });
  await Promise.all(
    participants.map(p =>
      sendMeetingNotification(
        p.memberId,
        `会議日程確定: ${meeting.title}`,
        `日時: ${bestDate.toLocaleString()}\n目的: ${meeting.purpose}`,
      ),
    ),
  );
  await audit(req, id, 'MEETING_FINALIZE', { scheduledAt: new Date().toISOString() });
  await audit(req, id, 'MEETING_FINALIZE', { scheduledAt: updated.scheduledAt });

  // ★ カレンダー書き込み（環境変数で有効化）
  if (process.env.CALENDAR_WRITE === 'true') {
    try {
      const result = await upsertMeetingEvent(id);
      if (result.ok) {
        await audit(req, id, 'MEETING_FINALIZE', { googleEventId: result.eventId, htmlLink: result.htmlLink });
      } else {
        await audit(req, id, 'MEETING_FINALIZE', { calendarWrite: 'skipped', reason: result.reason });
      }
    } catch (e: any) {
      await audit(req, id, 'MEETING_FINALIZE', { calendarWrite: 'error', message: e?.message ?? String(e) });
    }
  }

  res.json({ scheduledAt: bestDate });
};
