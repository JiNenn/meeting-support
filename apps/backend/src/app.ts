// apps/backend/src/app.ts
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';

import { initGoogleStrategy } from './modules/auth/google.strategy';
import { authRouter } from './modules/auth/auth.routes';
import { meetingRouter } from './modules/meetings/meeting.routes';
import { agendaRouter } from './modules/agenda/agenda.routes';
import { minutesRouter } from './modules/minutes/minutes.routes';
import { tasksRouter } from './modules/tasks/tasks.routes';
import { roleBootstrapRouter } from './modules/members/roleBootstrap.routes';
import { shareRouter } from './modules/share/share.routes';
import { debugRouter } from './modules/debug/debug.routes';
import { statusRouter } from './modules/system/status.routes';
import { pdfRouter } from './modules/export/pdf.routes';

export function createApp() {
  const app = express();

  // 認証戦略（必ず最初期に1回だけ）
  initGoogleStrategy();

  // セキュリティ系
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(hpp());
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // CORS（最上段）
  app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
  }));

  // ボディパーサ
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // セッション（1回だけ）
  app.use(session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: 'lax' },
  }));

  // Passport
  app.use(passport.initialize());
  app.use(passport.session());

  // ルーター配線
  app.use('/api/auth', authRouter);
  app.use('/api/meetings', meetingRouter);
  app.use('/api/meetings', agendaRouter);
  app.use('/api/meetings', minutesRouter);
  app.use('/api/meetings', tasksRouter);
  app.use('/api/members', roleBootstrapRouter);
  app.use('/api/meetings', shareRouter);
  app.use('/api',          shareRouter);   // 公開リンク（/api/public/:token）
  app.use('/api',          debugRouter);
  app.use('/api',          statusRouter);
  app.use('/api/meetings', pdfRouter);

  // デバッグ（任意）
  app.use((req, _res, next) => {
    console.log('AFTER PASSPORT user =', (req as any).user?.id);
    next();
  });

  return app;
}

