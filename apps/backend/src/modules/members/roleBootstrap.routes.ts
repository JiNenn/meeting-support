// apps/backend/src/modules/members/roleBootstrap.routes.ts
import { Router } from 'express';
import { ensureAuthenticated } from '@backend/middleware/ensureAuthenticated';
import { suggestMembersFromCalendar } from './roleBootstrap.service';
export const roleBootstrapRouter = Router();

roleBootstrapRouter.get('/bootstrap/role-suggestions', ensureAuthenticated, async (req, res) => {
  const me = (req as any).user.id as string;
  const list = await suggestMembersFromCalendar(me);
  res.json(list);
});
