import cron from 'node-cron';
import prisma from '@backend/prismaClient';
import { autoRefreshAgenda } from '@backend/modules/agenda/agenda.service';

let registered = false;

export function registerAgendaRefreshJob() {
  if (registered) return;  // devのホットリロードで多重起動を防止
  registered = true;

  const expr = process.env.CRON_AGENDA ?? '0 9,13,17 * * 1-5'; // 平日 9/13/17 時
  cron.schedule(
    expr,
    async () => {
      console.log('[job] agenda refresh start');
      const meetings = await prisma.meeting.findMany({ select: { id: true } });
      for (const m of meetings) {
        try {
          await autoRefreshAgenda(m.id);
        } catch (e) {
          console.warn('[job] agenda refresh failed', m.id, e);
        }
      }
      console.log('[job] agenda refresh done');
    },
    { timezone: 'Asia/Tokyo' } // JSTで動かす
  );
}
