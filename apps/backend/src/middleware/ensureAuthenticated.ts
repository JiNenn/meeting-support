import { Request, Response, NextFunction } from 'express';

export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if ((req as any).user) return next();
  return res.status(401).json({ error: 'unauthorized' });
}
