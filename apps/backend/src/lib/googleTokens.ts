import prisma from '@backend/prismaClient';
import { open, seal } from './secret';

export async function getMemberRefreshToken(memberId: string) {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { googleRefresh: true } });
  if (!m?.googleRefresh) return null;
  try { return open(m.googleRefresh); } catch { return null; } // 鍵変更や破損時も null
}

export async function setMemberRefreshToken(memberId: string, refresh: string) {
  const enc = seal(refresh);
  await prisma.member.update({ where: { id: memberId }, data: { googleRefresh: enc } });
}

export async function clearMemberRefreshToken(memberId: string) {
  await prisma.member.update({ where: { id: memberId }, data: { googleRefresh: null } });
}
