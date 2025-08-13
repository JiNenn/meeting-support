import { execSync } from 'child_process';
import path from 'path';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/meeting_support_test';
process.env.SESSION_SECRET = 'test';

export default async function() {
  const schema = path.resolve(__dirname, '../prisma/schema.prisma').replace(/\\test\\/, '\\'); // safety
  execSync(`npx prisma migrate deploy --schema ${schema}`, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
}
