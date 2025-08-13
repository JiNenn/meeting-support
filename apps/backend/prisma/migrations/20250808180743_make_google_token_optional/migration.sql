-- AlterTable
ALTER TABLE "public"."Meeting" ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."MeetingMember" ADD COLUMN     "preference" TEXT,
ADD COLUMN     "preferredStart" TIMESTAMP(3);
