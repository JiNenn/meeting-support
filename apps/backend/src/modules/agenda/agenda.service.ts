import prisma from '@backend/prismaClient';
import { suggestConcise } from '@backend/lib/ai';

// 3時間ごとの自動更新で使うロジック（スタブAIでも動く）
export async function autoRefreshAgenda(meetingId: string) {
  const agenda = await prisma.agenda.upsert({
    where: { meetingId },
    update: {},
    create: { meetingId },
  });

  const items = await prisma.agendaItem.findMany({
    where: { agendaId: agenda.id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  // 1) 正規化 & 重複排除
  const seen = new Set<string>();
  const normalized = items
    .map(i => ({ ...i, text: i.text.trim().replace(/\s+/g, ' ') }))
    .filter(i => {
      const key = i.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // 2) 要約（AIキーが無くても suggestConcise がスタブで動く）
  const summary = normalized.length
    ? await suggestConcise(normalized.map(i => `- ${i.text}`).join('\n'))
    : '（項目なし）';

  // 3) スナップショット保存（差分UI用）
  await prisma.agendaRevision.create({
    data: { agendaId: agenda.id, snapshot: { items: normalized, summary }, note: 'auto refresh' },
  });

  // 4) PARKING として要約を追記（重複は避ける）
  if (summary && summary !== '（項目なし）') {
    const exists = await prisma.agendaItem.findFirst({
      where: { agendaId: agenda.id, text: summary },
      select: { id: true },
    });
    if (!exists) {
      await prisma.agendaItem.create({
        data: { agendaId: agenda.id, text: summary, status: 'PARKING', sortOrder: 9999 },
      });
    }
  }
}
