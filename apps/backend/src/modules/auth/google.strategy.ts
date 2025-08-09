// apps/backend/src/modules/auth/google.strategy.ts
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import prisma from '@backend/prismaClient';

export function initGoogleStrategy() {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      passReqToCallback: true, // ★ 追加
    },
    async (req: any, accessToken, refreshToken, profile, done) => {
      try {
        const isLink = req.query.state === 'link'; // ★ /auth/google/link から来たか？

        if (isLink && req.user) {
          // 既存ユーザー（devなど）にトークンを保存
          const user = await prisma.member.update({
            where: { id: req.user.id },
            data: { googleAccess: accessToken, googleRefresh: refreshToken ?? null },
          });
          return done(null, user);
        }

        // 通常ログイン：メールで upsert
        const email = profile.emails?.[0].value ?? '';
        const user = await prisma.member.upsert({
          where: { email },
          update: { googleAccess: accessToken, googleRefresh: refreshToken ?? null },
          create: { email, roleLog: [], googleAccess: accessToken, googleRefresh: refreshToken ?? null },
        });
        return done(null, user);
      } catch (e) {
        return done(e as Error);
      }
    }
  ));

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    const user = await prisma.member.findUnique({ where: { id } });
    done(null, user);
  });
}
