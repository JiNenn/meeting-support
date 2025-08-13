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

import { tasksRouter } from './modules/tasks/tasks.routes';        // ★ tasks は“先勝ち”にしたいので前で import
import { agendaRouter } from './modules/agenda/agenda.routes';
import { minutesRouter } from './modules/minutes/minutes.routes';
import { pdfRouter } from './modules/export/pdf.routes';
import { suggestRouter } from './modules/members/suggest.routes';
import { ackRouter } from './modules/meetings/ack.routes';

import { roleBootstrapRouter } from './modules/members/roleBootstrap.routes';
import { shareRouter } from './modules/share/share.routes';
import { debugRouter } from './modules/debug/debug.routes';
import { statusRouter } from './modules/system/status.routes';
import { demoRouter } from './modules/demo/demo.routes';

import { registerAgendaRefreshJob } from './jobs/agendaRefresh.job';

const app = express();

/* ───────── Security / Core ───────── */
app.set('trust proxy', 1);
app.use(helmet());
app.use(hpp());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

/* CORS は早めに */
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));

/* Body parsers */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* Session（重複禁止） */
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite: 'lax' },
}));

/* Passport */
initGoogleStrategy();
app.use(passport.initialize());
app.use(passport.session());

/* ジョブ（任意） */
if (process.env.JOBS_ENABLED === 'true') {
  registerAgendaRefreshJob();
}

/* ───────── Routers（順序重要：具体的なもの→広いもの） ───────── */
app.use('/api/auth',     authRouter);
app.use('/api/meetings', meetingRouter);

/* ★ tasks を meetings 配下の先頭に置く（/:id/tasks を他ルータより先にマッチ） */
app.use('/api/meetings', tasksRouter);

/* meetings 配下の他ルータ */
app.use('/api/meetings', agendaRouter);
app.use('/api/meetings', minutesRouter);
app.use('/api/meetings', pdfRouter);
app.use('/api/meetings', suggestRouter);
app.use('/api/meetings', ackRouter);
app.use('/api/meetings', shareRouter);

/* meetings 直下以外 */
app.use('/api/members',  roleBootstrapRouter);
app.use('/api',          shareRouter);
app.use('/api',          debugRouter);
app.use('/api',          statusRouter);
app.use('/api',          demoRouter);

/* Health */
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

/* デバッグ（任意） */
app.use((req, _res, next) => {
  console.log('AFTER PASSPORT user=', (req as any).user?.id);
  next();
});

/* 404（最後に） */
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.originalUrl });
});

/* エラーハンドラ（最後の最後） */
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[unhandled]', err);
  const status = err?.status ?? 500;
  const payload: any = { error: 'internal_error', message: err?.message ?? String(err) };
  if (process.env.NODE_ENV !== 'production') payload.stack = err?.stack;
  res.status(status).json(payload);
});

// apps/backend/src/app.ts （すべての app.use(...) の最後）
// 500 JSON エラーハンドラ
app.use((err: any, req: any, res: any, _next: any) => {
  console.error('[ERROR]', req.method, req.originalUrl, err);
  const msg = err?.message || String(err);
  res.status(500).json({ error: 'internal_error', message: msg });
});


/* 起動 */
const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => console.log(`Backend listening on :${port}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));

export default app;
