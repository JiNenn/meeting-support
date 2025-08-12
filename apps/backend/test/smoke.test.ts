import request from 'supertest';
import { createApp } from '../src/app';

describe('smoke', () => {
  const app = createApp();
  const agent = request.agent(app);

  it('mock login -> status ok', async () => {
    await agent.get('/api/auth/mock').expect(200);
    const r = await agent.get('/api/auth/status').expect(200);
    expect(r.body?.user?.email).toBeDefined();
  });
});
