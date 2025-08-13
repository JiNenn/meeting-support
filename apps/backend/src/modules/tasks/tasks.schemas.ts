import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  due: z.coerce.date().optional(),
  mandatory: z.boolean().optional().default(false),
  assigneeId: z.string().optional(),     // null なら未割当
  push: z.boolean().optional().default(false),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  due: z.coerce.date().optional(),
  mandatory: z.boolean().optional(),
  assigneeId: z.string().optional().nullable(),
  status: z.enum(['OPEN','DONE']).optional(),
  push: z.boolean().optional().default(false),
});
