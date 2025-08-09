import { Readable } from 'stream';
import nodemailer from 'nodemailer';

/** Readable ストリームを Buffer へ集約 */
async function readableToBuffer(readable: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** MIME → base64url エンコード（Gmail API 用） */
export async function buildRawMessage(
  to: string,
  subject: string,
  text: string,
) {
  const mail = nodemailer.createTransport({ streamTransport: true });
  const { message } = await mail.sendMail({
    to,
    from: 'noreply@example.com',
    subject,
    text,
  });

  // Readable or Buffer をどちらでも扱えるように
  const msgBuf: Buffer = Buffer.isBuffer(message)
    ? message
    : await readableToBuffer(message as Readable);

  return msgBuf
    .toString('base64')                     // base64
    .replace(/\+/g, '-')                    // base64url 変換
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
