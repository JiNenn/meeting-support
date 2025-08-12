// apps/backend/src/modules/meetings/meeting.controller.ts
import { Request, Response } from 'express';
import prisma from '@backend/prismaClient';
import { sendMeetingNotification } from '@backend/modules/notification/gmail.service';
import { upsertMeetingEvent } from '@backend/modules/schedule/calendarWrite.service';
import { audit } from '@backend/lib/audit';

// ───────── createMeeting ─────────
export const createMeeting = async (req: Request, res: Response) => {
  console.log('BODY', req.body);
  console.log('USER', req.user);
  const { title, purpose } = req.body;
  const organizerId = (req.user as any).id;

  const meeting = await prisma.meeting.create({
    data: { title, purpose, organizerId },
  });

  await prisma.meetingMember.upsert({
    where: { meetingId_memberId: { meetingId: meeting.id, memberId: organizerId } },
    update: { role: 'REQUIRED' },
    create: { meetingId: meeting.id, memberId: organizerId, role: 'REQUIRED' },
  });

  await audit(req, meeting.id, 'MEETING_CREATE', { title: meeting.title, purpose: meeting.purpose });
  res.status(201).json(meeting);
};

// ───────── getMeeting ─────────
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

// ───────── finalizeMeeting ─────────
export const finalizeMeeting = async (req: Request, res: Response) => {
  const meetingId = req.params.id;

  // ❶ preference 集計
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

  // ❷ Meeting.scheduledAt を更新（※二重 update を排除）
  const updated = await prisma.meeting.update({
    where: { id: meetingId },
    data:  { scheduledAt: bestDate },
  });

  // ❸ 必須参加者へ通知
  const participants = await prisma.meetingMember.findMany({
    where: { meetingId, role: 'REQUIRED' },
  });
  await Promise.all(
    participants.map(p =>
      sendMeetingNotification(
        p.memberId,
        `会議日程確定: ${updated.title}`,
        `日時: ${bestDate.toLocaleString()}\n目的: ${updated.purpose}`,
      ),
    ),
  );

  await audit(req, meetingId, 'MEETING_FINALIZE', { scheduledAt: updated.scheduledAt });

  // 事前に型を上で定義
  type CalWrite =
    | { ok: true; eventId?: string; htmlLink?: string }
    | { ok: false; reason: 'needs_relink' | 'skipped' | 'error' | 'no_token'; message?: string };

  let calendarWrite: CalWrite = { ok: false, reason: 'skipped' };

  if (process.env.CALENDAR_WRITE === 'true') {
    try {
      const result = await upsertMeetingEvent(meetingId);

      // サービス側が 'no_token' を返す実装でも、外向きは 'needs_relink' に正規化
      if (!result.ok && result.reason === 'no_token') {
        calendarWrite = { ok: false, reason: 'needs_relink' };
      } else {
        calendarWrite = result as CalWrite;
      }

      console.log('[calendarWrite] result:', calendarWrite);

      if (calendarWrite.ok) {
        await audit(req, meetingId, 'MEETING_FINALIZE', {
          googleEventId: calendarWrite.eventId,
          htmlLink: calendarWrite.htmlLink,
        });
      } else if (calendarWrite.reason === 'needs_relink') {
        await audit(req, meetingId, 'MEETING_FINALIZE', { calendarWrite: 'needs_relink' });
      } else {
        await audit(req, meetingId, 'MEETING_FINALIZE', {
          calendarWrite: 'skipped',
          // reason は 'skipped' | 'error' | 'needs_relink'
          reason: calendarWrite.reason,
          message: 'message' in calendarWrite ? calendarWrite.message : undefined,
        });
      }
    } catch (e: any) {
      calendarWrite = { ok: false, reason: 'error', message: e?.message ?? String(e) };
      await audit(req, meetingId, 'MEETING_FINALIZE', {
        calendarWrite: 'error',
        message: calendarWrite.message,
      });
    }
  }

// ↓この後のレスポンス分岐も忘れず（needs_relink/no_token は 202）
  if (!calendarWrite.ok && (calendarWrite.reason === 'needs_relink' || calendarWrite.reason === 'no_token')) {
    return res.status(202).json({ scheduledAt: updated.scheduledAt, calendarWrite });
  }
  return res.status(200).json({ scheduledAt: updated.scheduledAt, calendarWrite })
};
