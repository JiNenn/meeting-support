// src/prismaClient.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'], // 開発中だけ verbose に
});

export default prisma;
