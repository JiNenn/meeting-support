// apps/backend/src/modules/meetings/meeting.controller.ts
import { Request, Response } from 'express';
import prisma from '@backend/prismaClient';
import { sendMeetingNotification } from '@backend/modules/notification/gmail.service';
import { rankCandidates } from '@backend/modules/schedule/ranking.algorithm';
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
  if (!m) return res.status(404).json({ error: 'not_found' });

  // 基本の返却オブジェクト
  const payload: any = {
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
    myAck: null as null | { readAt: Date | null; agreedAt: Date | null },
  };

  // 自分の既読/同意を付加（未ログインなら null のまま）
  const me = (req as any).user?.id as string | undefined;
  if (me) {
    const myAck = await prisma.meetingAck.findUnique({
      where: { meetingId_memberId: { meetingId: id, memberId: me } },
      select: { readAt: true, agreedAt: true },
    });
    payload.myAck = myAck ?? { readAt: null, agreedAt: null };

    // （任意）閲覧時に既読を自動記録したい場合は ?markRead=true で有効化
    if ((req.query.markRead ?? 'false') === 'true' && !myAck?.readAt) {
      const now = new Date();
      await prisma.meetingAck.upsert({
        where: { meetingId_memberId: { meetingId: id, memberId: me } },
        update: { readAt: now },
        create: { meetingId: id, memberId: me, readAt: now, agreedAt: null },
      });
      payload.myAck = { readAt: now, agreedAt: myAck?.agreedAt ?? null };
    }
  }

  return res.json(payload);
};

type CalWrite =
  | { ok: true; eventId?: string; htmlLink?: string }
  | { ok: false; reason: 'needs_relink' | 'skipped' | 'error' | 'no_token' | 'relink_required'; message?: string };

export const finalizeMeeting = async (req: Request, res: Response) => {
  const meetingId = req.params.id;

  // 0) すでに確定済みなら 409
  {
    const m = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { scheduledAt: true },
    });
    if (!m) return res.status(404).json({ error: 'not found' });
    if (m.scheduledAt) return res.status(409).json({ error: 'already finalized' });
  }

  // 1) 希望集計（ACCEPT=3, MAYBE=1）→ 最高得点の日時（同点は最も早い）を候補に
  const prefs = await prisma.meetingMember.findMany({
    where: { meetingId, preferredStart: { not: null } },
    select: { preferredStart: true, preference: true },
  });

  const validPrefs = prefs
    .map(p => {
      const d = p.preferredStart instanceof Date ? p.preferredStart : new Date(String(p.preferredStart));
      return Number.isNaN(+d) ? null : { d, preference: p.preference };
    })
    .filter(Boolean) as { d: Date; preference: 'ACCEPT' | 'MAYBE' | 'DECLINE' }[];

  let chosenStart: Date | null = null;

  if (validPrefs.length > 0) {
    const score: Record<string, { s: number; d: Date }> = {};
    for (const p of validPrefs) {
      const key = p.d.toISOString();
      const delta = p.preference === 'ACCEPT' ? 3 : p.preference === 'MAYBE' ? 1 : 0;
      if (!score[key]) score[key] = { s: 0, d: p.d };
      score[key].s += delta;
    }
    const best = Object.values(score)
      .sort((a, b) => (b.s - a.s) || (+a.d - +b.d))[0];
    if (best) chosenStart = best.d;
  }

  // 2) 希望が全く無い／不正ならランキングから自動選定（1週間先, duration 反映）
  if (!chosenStart) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { durationMinutes: true },
    });
    const members = await prisma.meetingMember.findMany({ where: { meetingId } });
    const reqIds = members.filter(m => m.role === 'REQUIRED').map(m => m.memberId);
    const optIds = members.filter(m => m.role !== 'REQUIRED').map(m => m.memberId);

    const from = new Date();
    const to = new Date(); to.setDate(to.getDate() + 7);

    const cand = await rankCandidates(reqIds, optIds, from, to, meeting?.durationMinutes ?? 60);
    if (!cand.length) return res.status(409).json({ error: 'no candidate' });

    const firstValid = cand.find(c => !Number.isNaN(Date.parse(c.start)));
    if (!firstValid) return res.status(409).json({ error: 'no candidate' });

    chosenStart = new Date(firstValid.start);
  }

  // 3) トランザクション内で確定（同時実行に強く）
  const updated = await prisma.$transaction(async (tx) => {
    const cur = await tx.meeting.findUnique({ where: { id: meetingId }, select: { scheduledAt: true } });
    if (!cur) throw new Error('not found'); // 外に 404 を返すのは簡略化しここでは throw
    if (cur.scheduledAt) return { scheduledAt: cur.scheduledAt, title: '', purpose: '' } as any;

    const u = await tx.meeting.update({
      where: { id: meetingId },
      data: { scheduledAt: chosenStart! },
      select: { id: true, title: true, purpose: true, scheduledAt: true, durationMinutes: true },
    });
    return u;
  });

  if (!updated || !updated.scheduledAt) {
    // 直前に他セッションが確定したケース
    return res.status(409).json({ error: 'already finalized' });
  }

  await audit(req as any, meetingId, 'MEETING_FINALIZE', { scheduledAt: updated.scheduledAt });

  // 4) Google カレンダー書き込み（環境でON時）
  let calendarWrite: CalWrite = { ok: false, reason: 'skipped' };
  if (process.env.CALENDAR_WRITE === 'true') {
    const result = await upsertMeetingEvent(meetingId);
    // サービスからの理由を正規化
    if (!result.ok && (result.reason === 'no_token' || result.reason === 'relink_required')) {
      calendarWrite = { ok: false, reason: 'needs_relink' };
    } else {
      calendarWrite = result as CalWrite;
    }
    await audit(req as any, meetingId, 'MEETING_FINALIZE', { calendarWrite });
  }

  // 5) 通知（必須参加者）— 失敗しても finalize 自体は成功扱い
  try {
    const required = await prisma.meetingMember.findMany({
      where: { meetingId, role: 'REQUIRED' },
      include: { member: { select: { id: true, email: true } } },
    });
    await Promise.all(
      required.map(p =>
        sendMeetingNotification(
          p.member.id,
          `会議日程確定: ${updated.title}`,
          `日時: ${new Date(updated.scheduledAt!).toLocaleString()}\n目的: ${updated.purpose}`
        )
      )
    );
  } catch (e) {
    // 通知失敗はログに留める（監査も任意）
    await audit(req as any, meetingId, 'MEETING_FINALIZE', { notify: 'error', message: String(e) });
  }

  // 6) レスポンス（needs_relink は 202）
  if (!calendarWrite.ok && (calendarWrite.reason === 'needs_relink' || calendarWrite.reason === 'no_token')) {
    return res.status(202).json({ scheduledAt: updated.scheduledAt, calendarWrite });
  }
  return res.status(200).json({ scheduledAt: updated.scheduledAt, calendarWrite });
};

async function finalizeAndNotify(req: Request, meetingId: string, startISO: string) {
  // 1) scheduledAt を更新
  const updated = await prisma.meeting.update({
    where: { id: meetingId },
    data: { scheduledAt: new Date(startISO) },
    include: {
      organizer: true,
      members: { include: { member: true } }
    },
  });

  // 2) Google Calendar（任意）
  let calendarWrite: any = { ok: false, reason: 'skipped' };
  if (process.env.CALENDAR_WRITE === 'true') {
    calendarWrite = await upsertMeetingEvent(meetingId);
  }

  // 3) 通知
  const participants = updated.members.filter(m => m.role === 'REQUIRED');
  await Promise.all(
    participants.map(p =>
      sendMeetingNotification(
        p.memberId,
        '会議日程が確定しました',
        `会議「${updated.title}」が確定しました。\n開始: ${updated.scheduledAt?.toISOString()}\n目的: ${updated.purpose}`,
      )
    )
  );

  // 4) 監査ログ（★ 実際の req を渡す）
  await audit(req as any, meetingId, 'MEETING_AUTO_FINALIZE', {
    scheduledAt: updated.scheduledAt,
    calendarWrite,
  });

  return { scheduledAt: updated.scheduledAt, calendarWrite };
}

/** 自動確定: 候補の上位1件で確定 */
export const autoFinalizeMeeting = async (req: Request, res: Response) => {
  const meetingId = req.params.id;

  const mtg = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { scheduledAt: true, durationMinutes: true },
  });
  if (!mtg) return res.status(404).json({ error: 'not_found' });
  if (mtg.scheduledAt) return res.status(409).json({ error: 'already_finalized' });

  const days     = Math.max(1, Math.min(30, Number(req.query.days ?? 7)));
  const startH   = Math.max(0, Math.min(23, Number(req.query.startHour ?? 9)));
  const endH     = Math.max(startH+1, Math.min(24, Number(req.query.endHour ?? 18)));
  const stepMin  = [15, 30, 60].includes(Number(req.query.stepMin)) ? Number(req.query.stepMin) : 30;
  const duration = mtg.durationMinutes ?? 60;

  const now = new Date();
  const to  = new Date(); to.setDate(to.getDate() + days);

  const members = await prisma.meetingMember.findMany({ where: { meetingId } });
  const reqIds  = members.filter(m => m.role === 'REQUIRED').map(m => m.memberId);
  const optIds  = members.filter(m => m.role !== 'REQUIRED').map(m => m.memberId);

  const ranked = await rankCandidates(reqIds, optIds, now, to, duration, {
    stepMin, startHour: startH, endHour: endH, weekdaysOnly: true,
  });
  if (!ranked.length) return res.status(422).json({ error: 'no_candidates' });

  const top = ranked[0];
  const result = await finalizeAndNotify(req, meetingId, top.start); // ★ req を渡す

  return res.status(200).json({
    chosenSlot: top,
    scheduledAt: result.scheduledAt,
    calendarWrite: result.calendarWrite,
  });
};