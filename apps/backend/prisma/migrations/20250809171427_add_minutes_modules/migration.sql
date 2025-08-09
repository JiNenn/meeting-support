-- CreateTable
CREATE TABLE "public"."Minutes" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Minutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MinuteEdit" (
    "id" TEXT NOT NULL,
    "minutesId" TEXT NOT NULL,
    "authorId" TEXT,
    "note" TEXT,
    "oldText" TEXT NOT NULL,
    "newText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MinuteEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Minutes_meetingId_key" ON "public"."Minutes"("meetingId");

-- CreateIndex
CREATE INDEX "MinuteEdit_minutesId_createdAt_idx" ON "public"."MinuteEdit"("minutesId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."Minutes" ADD CONSTRAINT "Minutes_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MinuteEdit" ADD CONSTRAINT "MinuteEdit_minutesId_fkey" FOREIGN KEY ("minutesId") REFERENCES "public"."Minutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MinuteEdit" ADD CONSTRAINT "MinuteEdit_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
