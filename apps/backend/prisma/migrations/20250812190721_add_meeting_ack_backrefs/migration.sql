-- CreateTable
CREATE TABLE "public"."MeetingAck" (
    "meetingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "agreedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingAck_pkey" PRIMARY KEY ("meetingId","memberId")
);

-- CreateIndex
CREATE INDEX "MeetingAck_meetingId_idx" ON "public"."MeetingAck"("meetingId");

-- AddForeignKey
ALTER TABLE "public"."MeetingAck" ADD CONSTRAINT "MeetingAck_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MeetingAck" ADD CONSTRAINT "MeetingAck_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
