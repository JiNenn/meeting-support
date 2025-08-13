// apps/backend/src/lib/audit.ts
import { Request } from 'express';
import prisma from '@backend/prismaClient';
// ★ ここがポイント：トップレベルの AuditAction を import
import { AuditAction } from '@prisma/client';

// 型だけ別名で使いたい場合はこうでもOK：
// import type { AuditAction as AuditActionType } from '@prisma/client';

export async function audit(
  req: Request | { user?: any },
  meetingId: string,
  action: (typeof AuditAction)[keyof typeof AuditAction], // ← enum 型
  detail?: any,
) {
  const actorId = (req as any)?.user?.id as string | undefined;
  await prisma.auditLog.create({
    data: {
      meetingId,
      action,                         // enum をそのまま渡す
      actorId: actorId ?? null,
      detail: detail ?? undefined,
    },
  });
}
