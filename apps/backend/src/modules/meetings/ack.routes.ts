import { Router } from 'express';
import prisma from '@backend/prismaClient';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';
import { requireOrganizer } from '@backend/middleware/requireOrganizer';
import { validate } from '@backend/middleware/validate';
import { ackUpdateSchema } from './ack.schemas';
import { audit } from '@backend/lib/audit';

// 参加メンバーであることを保証（存在しない場合 403）
async function requireMeetingMember(req: any, res: any, next: any) {
  const meetingId = req.params.id as string;
  const me = req.user?.id as string | undefined;
  if (!me) return res.status(401).json({ error: 'unauthorized' });

  const exists = await prisma.meetingMember.findUnique({
    where: { meetingId_memberId: { meetingId, memberId: me } },
    select: { memberId: true },
  });
  if (!exists) return res.status(403).json({ error: 'forbidden' });
  return next();
}

export const ackRouter = Router();

/**
 * 自分の既読/同意を記録（idempotent: 既に値があれば保持）
 * POST /api/meetings/:id/ack
 * body: { read?: true, agree?: true }
 */
// apps/backend/src/modules/meetings/ack.routes.ts
ackRouter.post('/:id/ack',
  ensureAuthenticated,
  requireMeetingMember,
  validate(ackUpdateSchema),
  async (req, res) => {
    try {
      const meetingId = req.params.id as string;
      const me = (req as any).user.id as string;
      const { read, agree } = req.body as { read?: boolean; agree?: boolean };

      const current = await prisma.meetingAck.findUnique({
        where: { meetingId_memberId: { meetingId, memberId: me } },
      });

      const now = new Date();
      const nextReadAt   = (read  && !current?.readAt)   ? now : current?.readAt ?? null;
      const nextAgreedAt = (agree && !current?.agreedAt) ? now : current?.agreedAt ?? null;

      const up = await prisma.meetingAck.upsert({
        where: { meetingId_memberId: { meetingId, memberId: me } },
        update: { readAt: nextReadAt, agreedAt: nextAgreedAt },
        create: { meetingId, memberId: me, readAt: nextReadAt, agreedAt: nextAgreedAt },
        select: { meetingId: true, memberId: true, readAt: true, agreedAt: true },
      });

      // ★ 監査は best-effort：失敗しても API は成功で返す
      try {
        await audit(req as any, meetingId, 'MEETING_ACK', {
          actor: me, read: !!read, agree: !!agree, readAt: up.readAt, agreedAt: up.agreedAt,
        });
      } catch (e) {
        console.warn('[ACK] audit failed:', e);
      }

      return res.json(up);
    } catch (e: any) {
      console.error('[ACK] handler failed:', e);
      return res.status(500).json({ error: 'internal_error', message: String(e?.message ?? e) });
    }
  }
);

/**
 * 主催者用：一覧と集計
 * GET /api/meetings/:id/ack
 */
ackRouter.get('/:id/ack',
  ensureAuthenticated,
  requireOrganizer,
  async (req, res) => {
    const meetingId = req.params.id as string;

    // 参加者一覧（メール/役割）
    const members = await prisma.meetingMember.findMany({
      where: { meetingId },
      include: { member: { select: { email: true } } },
      orderBy: [{ role: 'asc' }, { memberId: 'asc' }],
    });

    // Ack を引く
    const acks = await prisma.meetingAck.findMany({
      where: { meetingId },
    });
    const ackMap = new Map(acks.map(a => [`${a.memberId}`, a]));

    const rows = members.map(m => {
      const a = ackMap.get(m.memberId);
      return {
        memberId: m.memberId,
        email: m.member.email,
        role: m.role,
        readAt: a?.readAt ?? null,
        agreedAt: a?.agreedAt ?? null,
      };
    });

    const total = rows.length;
    const readCnt = rows.filter(r => !!r.readAt).length;
    const agreeCnt = rows.filter(r => !!r.agreedAt).length;

    res.json({
      summary: { total, read: readCnt, agreed: agreeCnt, rateRead: total? readCnt/total : 0, rateAgreed: total? agreeCnt/total : 0 },
      rows,
    });
  }
);
