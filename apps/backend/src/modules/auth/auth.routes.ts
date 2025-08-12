import { Router } from 'express';
import passport from 'passport';
import prisma from '@backend/prismaClient'; 
import { getMemberRefreshToken } from '@backend/lib/googleTokens';

export const authRouter = Router();

/* ───────── Google OAuth ───────── */
const GOOGLE_SCOPES = [
  'email', 'profile',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

authRouter.get('/google',
  passport.authenticate('google', { scope: GOOGLE_SCOPES, accessType: 'offline', prompt: 'consent' })
);
authRouter.get('/google/link',
  passport.authenticate('google', { scope: GOOGLE_SCOPES, accessType: 'offline', prompt: 'consent', state: 'link' })
);


authRouter.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (_req, res) => {
    // ここを 3000 に
    res.redirect('http://localhost:3000/linked');
  }
);

// 成功メッセージ用（任意）
authRouter.get('/linked', (_req, res) => res.send('Google link OK!'));


authRouter.get('/mock', async (req, res, next) => {
  try {
    const user = await prisma.member.upsert({
      where:  { email: 'dev@example.com' },
      update: {},
      create: { id: 'dev', email: 'dev@example.com', roleLog: [] },
    });

    req.login(user, err => {
      if (err) return next(err);
      res.send('mock login OK');
    });
  } catch (e) {
    next(e);
  }
});


authRouter.get('/status', async (req, res) => {
  const user = (req as any).user ?? null;
  if (!user) return res.json({ user: null });
  const hasAny = (await getMemberRefreshToken(user.id)) != null;
  res.json({ user, providers: { google: { needsRelink: !hasAny } } });
});




/* ───────── ログアウト ───────── */
authRouter.get('/logout', (req, res) => {
  req.logout(() => {});
  res.redirect('/login');
});
