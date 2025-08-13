-- CreateEnum
CREATE TYPE "public"."AuditAction" AS ENUM ('MEETING_CREATE', 'MEMBER_INVITE', 'MEMBER_ROLE_UPDATE', 'MEMBER_REMOVE', 'PREFERENCE_SET', 'MEETING_FINALIZE', 'AGENDA_ITEM_ADD', 'AGENDA_ITEM_UPDATE', 'HONEST_APPLY', 'MINUTES_UPLOAD', 'MINUTES_POLISH', 'MINUTES_CORRECT', 'TASK_CREATE', 'TASK_UPDATE', 'TASK_PUSH', 'SHARE_ISSUE', 'SHARE_REVOKE');

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "public"."AuditAction" NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ShareLink" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_meetingId_createdAt_idx" ON "public"."AuditLog"("meetingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "public"."ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_meetingId_idx" ON "public"."ShareLink"("meetingId");

-- CreateIndex
CREATE INDEX "AgendaRevision_agendaId_createdAt_idx" ON "public"."AgendaRevision"("agendaId", "createdAt");

-- CreateIndex
CREATE INDEX "Meeting_organizerId_idx" ON "public"."Meeting"("organizerId");

-- CreateIndex
CREATE INDEX "PreQuestion_toMemberId_idx" ON "public"."PreQuestion"("toMemberId");

-- AddForeignKey
ALTER TABLE "public"."HonestThread" ADD CONSTRAINT "HonestThread_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HonestThread" ADD CONSTRAINT "HonestThread_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PreQuestion" ADD CONSTRAINT "PreQuestion_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PreQuestion" ADD CONSTRAINT "PreQuestion_toMemberId_fkey" FOREIGN KEY ("toMemberId") REFERENCES "public"."Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ShareLink" ADD CONSTRAINT "ShareLink_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ShareLink" ADD CONSTRAINT "ShareLink_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
