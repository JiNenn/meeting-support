import { Router } from 'express';
import passport from 'passport';
import prisma from '@backend/prismaClient';           // ① 追加

export const authRouter = Router();

/* ───────── Google OAuth ───────── */
authRouter.get(
  '/google',
  passport.authenticate('google', {
    scope: [
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.send',   // ② Gmail 送信スコープ
    ],
    accessType: 'offline',      // ② refresh_token を必ず取得
    prompt: 'consent',
  }),
);

// 新規: ログイン中ユーザーにトークンを「リンク」
authRouter.get('/google/link',
  passport.authenticate('google', {
    scope: ['email', 'profile', 'https://www.googleapis.com/auth/gmail.send'],
    accessType: 'offline',
    prompt: 'consent',
    state: 'link', // ★ callback 側で識別
  })
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


authRouter.get('/status', (req, res) =>
  res.json({ user: (req as any).user ?? null })
);



/* ───────── ログアウト ───────── */
authRouter.get('/logout', (req, res) => {
  req.logout(() => {});
  res.redirect('/login');
});
