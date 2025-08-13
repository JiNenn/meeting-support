/*
  Warnings:

  - You are about to drop the column `memberId` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `strict` on the `Task` table. All the data in the column will be lost.
  - Added the required column `meetingId` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Task` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('OPEN', 'DONE');

-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_memberId_fkey";

-- AlterTable
ALTER TABLE "public"."Task" DROP COLUMN "memberId",
DROP COLUMN "strict",
ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "googleTaskId" TEXT,
ADD COLUMN     "googleTaskListId" TEXT,
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meetingId" TEXT NOT NULL,
ADD COLUMN     "status" "public"."TaskStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Task_meetingId_assigneeId_status_idx" ON "public"."Task"("meetingId", "assigneeId", "status");

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "public"."Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
