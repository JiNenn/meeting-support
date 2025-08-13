// apps/backend/src/modules/system/status.routes.ts
import { Router } from 'express';
import prisma from '@backend/prismaClient';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';
import { getMemberRefreshToken } from '@backend/lib/googleTokens';

export const statusRouter = Router();

statusRouter.get('/system/status', ensureAuthenticated, async (req, res) => {
  const me = (req as any).user.id as string;
  const refresh = await getMemberRefreshToken(me);
  // 連携判定はトークン有無ベース（細かいscopes判定は将来拡張）
  const hasToken = !!refresh;

  res.json({
    ok: true,
    jobsEnabled: process.env.JOBS_ENABLED === 'true',
    freebusyTtlSec: Number(process.env.FREEBUSY_TTL_SEC ?? 300),
    integrations: {
      google: hasToken,
      // 追加で flags を返すならここに
    },
  });
});
