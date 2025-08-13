import request from 'supertest';
import { createApp } from '../src/app';
import prisma from '../src/prismaClient';

describe('Meetings API', () => {
  const app = createApp();
  const agent = request.agent(app);

  beforeAll(async () => {
    // モックログイン
    await agent.get('/api/auth/mock').expect(200);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a meeting and fetches it', async () => {
    const res = await agent.post('/api/meetings').send({ title: 'JestKick', purpose: 'Ensure works' }).expect(201);
    const id = res.body.id as string;

    const g = await agent.get(`/api/meetings/${id}`).expect(200);
    expect(g.body.title).toBe('JestKick');

    const c = await agent.get(`/api/meetings/${id}/candidates`).expect(200);
    expect(Array.isArray(c.body)).toBe(true);
  });
});
