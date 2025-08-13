/*
  Warnings:

  - The values [AGENDA_ITEM_ADD] on the enum `AuditAction` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."AuditAction_new" AS ENUM ('MEETING_CREATE', 'MEMBER_INVITE', 'MEMBER_ROLE_UPDATE', 'MEMBER_REMOVE', 'PREFERENCE_SET', 'MEETING_FINALIZE', 'MEETING_AUTO_FINALIZE', 'AGENDA_ITEM_UPDATE', 'HONEST_APPLY', 'MINUTES_UPLOAD', 'MINUTES_POLISH', 'MINUTES_CORRECT', 'TASK_CREATE', 'TASK_UPDATE', 'TASK_PUSH', 'SHARE_ISSUE', 'SHARE_REVOKE');
ALTER TABLE "public"."AuditLog" ALTER COLUMN "action" TYPE "public"."AuditAction_new" USING ("action"::text::"public"."AuditAction_new");
ALTER TYPE "public"."AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "public"."AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "public"."AuditAction_old";
COMMIT;
