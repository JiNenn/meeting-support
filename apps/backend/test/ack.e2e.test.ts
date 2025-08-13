import request from 'supertest';
import { createApp } from '../src/app';
import prisma from '../src/prismaClient';

describe('Meeting Ack', () => {
  const app = createApp();
  const agent = request.agent(app);
  let meetingId = '';

  beforeAll(async () => {
    await agent.get('/api/auth/mock');
    // 会議作成して主催者をREQUIREDで追加される想定
    const c = await agent.post('/api/meetings').send({ title: 'Ack', purpose: 'Test' });
    meetingId = c.body.id;
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('sets read and agree timestamps', async () => {
    await agent.post(`/api/meetings/${meetingId}/ack`).send({ read: true }).expect(200);
    await agent.post(`/api/meetings/${meetingId}/ack`).send({ agree: true }).expect(200);

    const list = await agent.get(`/api/meetings/${meetingId}/ack`).expect(200);
    expect(list.body.summary.total).toBeGreaterThan(0);
    expect(list.body.summary.read).toBeGreaterThan(0);
    expect(list.body.summary.agreed).toBeGreaterThanOrEqual(0);
  });
});
