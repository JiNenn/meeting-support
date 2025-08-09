import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';

import { initGoogleStrategy } from './modules/auth/google.strategy';
import { authRouter } from './modules/auth/auth.routes';
import { meetingRouter } from './modules/meetings/meeting.routes';
import { agendaRouter } from './modules/agenda/agenda.routes';
import { minutesRouter } from './modules/minutes/minutes.routes';

const app = express();
initGoogleStrategy();

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

/* 4) ルーター */
app.use('/api/auth', authRouter);
app.use('/api/meetings', meetingRouter);
app.use('/api/meetings', agendaRouter);
app.use('/api/meetings', minutesRouter);

/* デバッグ（任意） */
app.use((req, _res, next) => { console.log('AFTER PASSPORT user=', (req as any).user?.id); next(); });

app.listen(4000, () => console.log('Backend listening on :4000'));
