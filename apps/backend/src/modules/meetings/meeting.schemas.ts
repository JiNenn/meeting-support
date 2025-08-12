// apps/backend/src/modules/meetings/meeting.schemas.ts
import { z } from 'zod';

export const createMeetingSchema = z.object({
  title: z.string().min(1).max(200),
  purpose: z.string().min(1).max(1000),
});

export const inviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(['REQUIRED','OPTIONAL']),
});

export const updateMeetingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  purpose: z.string().min(1).max(1000).optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),  // ★ 15〜480分
});
