import { Prisma } from '@prisma/client';   // ★ Prisma.sql を使うために追加
import { OpenAI } from 'openai';
import prisma from '@backend/prismaClient';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 目的文からメンバー候補を返す（暫定版: 類似度=1.0 のダミー）
 */
export async function suggestMembers(
  purpose: string,
  topK: number = 5,
) {
  // ❶ 目的文を埋め込みベクトル化（※埋め込んだ値は未利用）
  await openai.embeddings.create({
    input: purpose,
    model: 'text-embedding-3-small',
  });

  // ❷ pgvector 等で類似度検索するまではダミー実装
  //    Prisma.sql`...` 内に ${topK} を埋め込めば自動でバインドされる
  const members = await prisma.$queryRaw<
    { id: string; email: string; similarity: number }[]
  >(Prisma.sql`
    SELECT id, email, 1.0 AS similarity
    FROM "Member"
    LIMIT ${topK}
  `);

  return members;
}
