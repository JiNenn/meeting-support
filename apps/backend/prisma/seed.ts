// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.member.createMany({
    data: [
      { email: 'alice@example.com', roleLog: [] },
      { email: 'bob@example.com',   roleLog: [] },
    ],
    skipDuplicates: true,  // 既存の email は飛ばす
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
  });
