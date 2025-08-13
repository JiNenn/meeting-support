/*
  Warnings:

  - Added the required column `updatedAt` to the `Meeting` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."AgendaItemStatus" AS ENUM ('OPEN', 'DECIDED', 'PARKING');

-- Meeting.updatedAt を既存行に即時充填できる形で追加
ALTER TABLE "public"."Meeting"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;


-- CreateTable
CREATE TABLE "public"."Agenda" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgendaItem" (
    "id" TEXT NOT NULL,
    "agendaId" TEXT NOT NULL,
    "authorId" TEXT,
    "text" TEXT NOT NULL,
    "status" "public"."AgendaItemStatus" NOT NULL DEFAULT 'OPEN',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgendaRevision" (
    "id" TEXT NOT NULL,
    "agendaId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HonestThread" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "suggestedText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HonestThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PreQuestion" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "toMemberId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agenda_meetingId_key" ON "public"."Agenda"("meetingId");

-- CreateIndex
CREATE INDEX "AgendaItem_agendaId_sortOrder_idx" ON "public"."AgendaItem"("agendaId", "sortOrder");

-- CreateIndex
CREATE INDEX "HonestThread_meetingId_memberId_status_idx" ON "public"."HonestThread"("meetingId", "memberId", "status");

-- CreateIndex
CREATE INDEX "PreQuestion_meetingId_idx" ON "public"."PreQuestion"("meetingId");

-- AddForeignKey
ALTER TABLE "public"."Agenda" ADD CONSTRAINT "Agenda_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgendaItem" ADD CONSTRAINT "AgendaItem_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "public"."Agenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgendaItem" ADD CONSTRAINT "AgendaItem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgendaRevision" ADD CONSTRAINT "AgendaRevision_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "public"."Agenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
