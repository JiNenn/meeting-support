import { z } from 'zod';

/**
 * both optional。true の時だけタイムスタンプを「初回設定」する。
 * false は無視（取り消し＝revoke は今回未対応）。
 */
export const ackUpdateSchema = z.object({
  read:  z.boolean().optional(),
  agree: z.boolean().optional(),
});
