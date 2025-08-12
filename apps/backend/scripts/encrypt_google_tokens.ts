import 'dotenv/config';
import prisma from '../src/prismaClient';
import { seal } from '../src/lib/secret';

(async () => {
  const rows = await prisma.member.findMany({ select: { id: true, googleRefresh: true } });
  for (const r of rows) {
    const v = r.googleRefresh;
    if (!v) continue;
    if (v.startsWith('enc.v1.')) continue;
    await prisma.member.update({ where: { id: r.id }, data: { googleRefresh: seal(v) } });
    console.log('encrypted', r.id);
  }
  process.exit(0);
})();
