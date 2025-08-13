import request from 'supertest';
import { createApp } from '../src/app';
import prisma from '../src/prismaClient';

describe('Auto finalize', () => {
  const app = createApp();
  const agent = request.agent(app);

  beforeAll(async () => {
    await agent.get('/api/auth/mock').expect(200);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('auto-finalizes the top candidate', async () => {
    // 会議を作成
    const { body } = await agent.post('/api/meetings').send({ title: 'Auto', purpose: '調整' }).expect(201);
    const id = body.id as string;

    // 自動確定（FAKEカレンダーでも候補が出る前提）
    const res = await agent.post(`/api/meetings/auto-finalize/${id}`).expect(200);
    expect(res.body.scheduledAt).toBeTruthy();

    // GETで確定済みになっている
    const g = await agent.get(`/api/meetings/${id}`).expect(200);
    expect(g.body.scheduledAt).toBeTruthy();

    // 以降の candidates は 204 or 空
    const cand = await agent.get(`/api/meetings/${id}/candidates`);
    expect([204, 200]).toContain(cand.status);
  });
});
