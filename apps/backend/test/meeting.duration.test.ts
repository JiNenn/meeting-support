import request from 'supertest';
import { createApp } from '../src/app';
import prisma from '../src/prismaClient';

describe('Meeting duration', () => {
  const app = createApp();
  const agent = request.agent(app);

  beforeAll(async () => { await agent.get('/api/auth/mock').expect(200); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('updates duration and candidates respect it', async () => {
    const { body } = await agent.post('/api/meetings').send({ title:'D', purpose:'P' }).expect(201);
    const id = body.id as string;

    await agent.patch(`/api/meetings/${id}`).send({ durationMinutes: 90 }).expect(200);

    const c = await agent.get(`/api/meetings/${id}/candidates`).expect(200);
    expect(Array.isArray(c.body)).toBe(true);
    // 候補の end-start が 90分になっていることを軽く検査
    if (c.body.length) {
      const a = new Date(c.body[0].start).getTime();
      const b = new Date(c.body[0].end).getTime();
      expect((b-a)/60000).toBe(90);
    }
  });
});
