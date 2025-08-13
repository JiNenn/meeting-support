// apps/backend/src/modules/auth/google.strategy.ts
import type { Request } from 'express';
import passport from 'passport';
import {
  Strategy as GoogleStrategy,
  Profile,
  VerifyCallback,
  GoogleCallbackParameters,
} from 'passport-google-oauth20';
import prisma from '@backend/prismaClient';
import { setMemberRefreshToken } from '@backend/lib/googleTokens';

export function initGoogleStrategy() {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      passReqToCallback: true,
    },
    // 正しいシグネチャ：req, accessToken, refreshToken, params, profile, done
    async (
      req: Request,
      accessToken: string,
      refreshToken: string,                 // 型は string 固定（実際は空文字のことがある）
      _params: GoogleCallbackParameters,    // 使わなくても受け取る
      profile: Profile,
      done: VerifyCallback
    ) => {
      try {
        const isLink = req.query.state === 'link';

        // Express.User は任意型なので実行時に id の有無をチェック
        const authUser = (req.user as { id?: string } | undefined);
        const rt = refreshToken || undefined; // 空文字対策

        if (isLink && authUser?.id) {
          const updated = await prisma.member.update({
            where: { id: authUser.id },
            data: {
              googleAccess: accessToken,
              ...(rt ? { googleRefresh: rt } : {}),
            },
          });
          if (rt) await setMemberRefreshToken(updated.id, rt);
          return done(null, updated);
        }

        const email = profile.emails?.[0]?.value?.toLowerCase() ?? '';
        if (!email) return done(new Error('Google profile has no email'));

        const user = await prisma.member.upsert({
          where: { email },
          update: {
            googleAccess: accessToken,
            ...(rt ? { googleRefresh: rt } : {}),
          },
          create: {
            email,
            roleLog: [],
            googleAccess: accessToken,
            ...(rt ? { googleRefresh: rt } : {}),
          },
        });

        if (rt) await setMemberRefreshToken(user.id, rt);
        return done(null, user);
      } catch (e) {
        return done(e as Error);
      }
    }
  ));

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.member.findUnique({ where: { id } });
      done(null, user);
    } catch (e) {
      done(e as Error);
    }
  });
}

