// apps/backend/src/middleware/validate.ts
import { AnyZodObject, ZodError } from 'zod';
import { RequestHandler } from 'express';

export const validate = (schema: AnyZodObject): RequestHandler => async (req, res, next) => {
  try {
    req.body = await schema.parseAsync(req.body);
    next();
  } catch (e) {
    if (e instanceof ZodError) return res.status(400).json({ error: 'invalid_input', issues: e.flatten() });
    next(e);
  }
};
