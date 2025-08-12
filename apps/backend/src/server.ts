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
import { registerAgendaRefreshJob } from './jobs/agendaRefresh.job';

import { shareRouter } from './modules/share/share.routes';
import { debugRouter } from './modules/debug/debug.routes';
import { statusRouter } from './modules/system/status.routes';
import { pdfRouter } from './modules/export/pdf.routes';
import { demoRouter } from './modules/demo/demo.routes';

const app = express();
initGoogleStrategy();

app.set('trust proxy', 1);
app.use(helmet());
app.use(hpp());

const limiter = rateLimit({
  windowMs: 15*60*1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

/* 0) CORS は一番上で */
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));

/* 1) JSON */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* 2) セッション（★二重登録になっていたので一つに統一） */
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite: 'lax' },
}));

/* 3) passport */
app.use(passport.initialize());
app.use(passport.session());

if (process.env.JOBS_ENABLED === 'true') {
  registerAgendaRefreshJob();
}

// apps/backend/src/modules/agenda/agenda.routes.ts 冒頭
agendaRouter.use((req, _res, next) => {
  console.log('[agenda]', req.method, req.originalUrl);
  next();
});


// apps/backend/src/modules/minutes/minutes.routes.ts 冒頭
minutesRouter.use((req, _res, next) => {
  console.log('[minutes]', req.method, req.originalUrl);
  next();
});

/* 4) ルーター */
app.use('/api/auth', authRouter);
app.use('/api/meetings', meetingRouter);
app.use('/api/meetings', agendaRouter);
app.use('/api/meetings', minutesRouter);
app.use('/api/meetings', tasksRouter);
app.use('/api/members', roleBootstrapRouter);
app.use('/api/meetings', shareRouter);
app.use('/api', shareRouter);
app.use('/api', debugRouter);
app.use('/api', statusRouter);
app.use('/api/meetings', pdfRouter);
app.use('/api', demoRouter);

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

/* デバッグ（任意） */
app.use((req, _res, next) => { console.log('AFTER PASSPORT user=', (req as any).user?.id); next(); });

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'internal_error' });
});

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => console.log(`Backend listening on :${port}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
