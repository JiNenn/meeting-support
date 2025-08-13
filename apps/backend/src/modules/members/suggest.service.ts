import prisma from '@backend/prismaClient';
import { extractPurposeTags } from './keywords';

type RoleLogEntry = string | { tag?: string; count?: number } | Record<string, any>;

function extractMemberTags(roleLog: any): { tags: Set<string>, freq: Record<string, number> } {
  const tags = new Set<string>();
  const freq: Record<string, number> = {};
  const arr: RoleLogEntry[] = Array.isArray(roleLog) ? roleLog as any[] : [];
  for (const e of arr) {
    if (typeof e === 'string') {
      tags.add(e); freq[e] = (freq[e] ?? 0) + 1;
    } else if (e && typeof e === 'object') {
      const t = (e as any).tag ?? Object.keys(e)[0];
      if (t) { tags.add(t); freq[t] = (freq[t] ?? 0) + (Number((e as any).count) || 1); }
    }
  }
  return { tags, freq };
}

function scoreMember(
  purposeTags: Set<string>,
  memberTags: Set<string>,
  memberFreq: Record<string, number>,
  participationCount: number,
) {
  let tagMatches = 0;
  let tagScore = 0;

  for (const t of purposeTags) {
    if (memberTags.has(t)) {
      tagMatches++;
      // タグ一致は強め、頻度で微増
      tagScore += 10 + Math.min(5, (memberFreq[t] ?? 0));
    }
  }

  // 参加実績（多すぎても頭打ち）
  const partScore = Math.min(10, participationCount);

  // 一致ゼロなら微ペナルティ
  const penalty = tagMatches === 0 ? -5 : 0;

  const total = tagScore + partScore + penalty;

  return { total, tagMatches, tagScore, partScore, penalty };
}

export async function suggestMembersForMeeting(meetingId: string, topReq = 3, topOpt = 3) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, title: true, purpose: true, organizerId: true },
  });
  if (!meeting) throw new Error('meeting not found');

  const purposeText = [meeting.title, meeting.purpose].filter(Boolean).join(' ');
  const { tags: purposeTags, hits: purposeHits } = extractPurposeTags(purposeText);

  // 既参加者を除外
  const already = await prisma.meetingMember.findMany({
    where: { meetingId },
    select: { memberId: true },
  });
  const exclude = new Set(already.map(a => a.memberId));
  if (meeting.organizerId) exclude.add(meeting.organizerId);

  // 全メンバー（今回は全体から。必要ならプロジェクト単位に絞る）
  const members = await prisma.member.findMany({
    select: { id: true, email: true, roleLog: true },
  });

  // 参加実績（総数）
  const grouped = await prisma.meetingMember.groupBy({
    by: ['memberId'],
    _count: { memberId: true },
  });
  const partCount: Record<string, number> = {};
  for (const g of grouped) partCount[g.memberId] = g._count.memberId;

  // スコアリング
  const scored = members
    .filter(m => !exclude.has(m.id))
    .map(m => {
      const { tags, freq } = extractMemberTags(m.roleLog);
      const s = scoreMember(purposeTags, tags, freq, partCount[m.id] ?? 0);
      return {
        memberId: m.id,
        email: m.email,
        score: s.total,
        breakdown: { tagMatches: s.tagMatches, tagScore: s.tagScore, participation: s.partScore, penalty: s.penalty },
      };
    })
    .sort((a, b) => b.score - a.score);

  // 分類：タグ一致があるものを優先して REQUIRED、ないものを OPTIONAL
  const required: typeof scored = [];
  const optional: typeof scored = [];

  for (const c of scored) {
    if (c.breakdown.tagMatches > 0 && required.length < topReq) required.push(c);
    else if (optional.length < topOpt) optional.push(c);
    if (required.length >= topReq && optional.length >= topOpt) break;
  }

  return {
    purposeTags: Array.from(purposeTags),
    purposeHits,
    pool: scored.length,
    required,
    optional,
  };
}
