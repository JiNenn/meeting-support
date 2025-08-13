import prisma from '@backend/prismaClient';
import puppeteer from 'puppeteer';

export async function renderMeetingPdf(meetingId: string) {
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      organizer: true,
      agenda: { include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } } },
    },
  });
  if (!m) throw new Error('meeting not found');

  const minutes = await prisma.minutes.findUnique({ where: { meetingId } });

  const esc = (s: string) => (s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const fmt = (d?: Date | null) => d ? new Date(d).toLocaleString() : '—';

  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Noto Sans JP",sans-serif;margin:24px;}
  h1{margin:0 0 4px 0} h2{margin:16px 0 8px 0}
  .muted{color:#666;font-size:12px}
  .pill{display:inline-block;border:1px solid #999;border-radius:6px;padding:0 6px;margin-left:6px;font-size:12px}
  ul{margin:6px 0 0 18px} li{margin:2px 0}
  pre{white-space:pre-wrap;background:#fafafa;border:1px solid #eee;padding:8px;border-radius:6px}
</style></head>
<body>
  <h1>【会議】${esc(m.title)}</h1>
  <div class="muted">Meeting ID: ${m.id}</div>
  <div>目的: ${esc(m.purpose)}</div>
  <div>主催: ${esc(m.organizer.email)} <span class="pill">${m.googleEventId ? 'Google Cal 登録済' : '未登録'}</span></div>
  <div>確定日時: ${fmt(m.scheduledAt)}</div>
  <div>所要時間: ${m.durationMinutes ?? 60} 分</div>

  <h2>アジェンダ</h2>
  <ul>
    ${(m.agenda?.items ?? []).map(it => `<li>${esc(it.text)} <span class="pill">${it.status}</span></li>`).join('') || '<li>（項目なし）</li>'}
  </ul>

  <h2>議事録（抜粋）</h2>
  ${minutes?.content ? `<pre>${esc(minutes.content).slice(0,5000)}</pre>` : '<div class="muted">未登録</div>'}
</body></html>`;

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm' } });
    return pdf; // Buffer
  } finally {
    await browser.close();
  }
}
