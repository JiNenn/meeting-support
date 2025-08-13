// apps/backend/scripts/preflight.ts
import 'dotenv/config';
import prisma from '../src/prismaClient';

function req(name: string) {
  const v = process.env[name];
  const ok = !!v && v !== 'CHANGEME';
  return { name, ok, value: ok ? '(set)' : '' };
}

async function main() {
  const checks = [
    req('SESSION_SECRET'),
    req('DATABASE_URL'),
    req('GOOGLE_CLIENT_ID'),
    req('GOOGLE_CLIENT_SECRET'),
    req('GOOGLE_CALLBACK_URL'),
    { name: 'CALENDAR_PROVIDER', ok: ['google','fake'].includes(process.env.CALENDAR_PROVIDER ?? 'google'), value: process.env.CALENDAR_PROVIDER },
    { name: 'LLM_MODE', ok: ['off','manual','api'].includes(process.env.LLM_MODE ?? 'manual'), value: process.env.LLM_MODE },
    { name: 'JOBS_ENABLED', ok: ['true','false',undefined].includes(process.env.JOBS_ENABLED ?? undefined as any), value: process.env.JOBS_ENABLED },
  ];

  // DB
  let dbOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  checks.push({ name: 'DB_CONNECT', ok: dbOk, value: dbOk ? 'ok' : 'fail' });

  // ログイン済ユーザーのトークン有無（あれば1人見る）
  const anyUser = await prisma.member.findFirst({ select: { id:true, email:true, googleRefresh:true } });
  checks.push({ name: 'ANY_USER', ok: !!anyUser, value: anyUser?.email ?? '' });
  if (anyUser) {
    checks.push({ name: 'ANY_USER_REFRESH', ok: !!anyUser.googleRefresh, value: anyUser.googleRefresh ? 'exists' : '' });
  }

  // 出力
  const bad = checks.filter(c => !c.ok);
  for (const c of checks) {
    const mark = c.ok ? '✅' : '❌';
    console.log(`${mark} ${c.name} ${c.value ?? ''}`);
  }
  if (bad.length) {
    console.log('\n❌ Preflight failed. Fix the items above.');
    process.exit(1);
  } else {
    console.log('\n✅ Preflight passed.');
  }
  await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
