import { Request, Response } from 'express';
import prisma from '@backend/prismaClient';
import { createEvent } from 'ics';

export async function createIcs(req: Request, res: Response) {
  const { id } = req.params;
  const bom = process.env.ICS_UTF8_BOM === 'true' ? '\uFEFF' : '';
  const mtg = await prisma.meeting.findUnique({
    where: { id },
    include: { organizer: true, members: { include: { member: true } } },
  });
  if (!mtg) return res.status(404).json({ error: 'meeting not found' });
  if (!mtg.scheduledAt) return res.status(400).json({ error: 'not scheduled' });

  const start = new Date(mtg.scheduledAt);
  const end   = new Date(start); end.setMinutes(end.getMinutes() + 60);

  const toUTCParts = (d: Date) => [
    d.getUTCFullYear(), d.getUTCMonth()+1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(),
  ] as [number, number, number, number, number];

  const attendees = [
    { name: mtg.organizer.email, email: mtg.organizer.email, rsvp: true },
    ...mtg.members.map(mm => ({ name: mm.member.email, email: mm.member.email, rsvp: true })),
  ];

  const { error, value } = createEvent({
    uid: `${mtg.id}@meeting-support`,
    start: toUTCParts(start),
    end:   toUTCParts(end),
    title: `【会議】${mtg.title}`,
    description: `目的: ${mtg.purpose}\nMeeting ID: ${mtg.id}`,
    organizer: { name: mtg.organizer.email, email: mtg.organizer.email },
    attendees,
    status: 'CONFIRMED',
    calName: 'Meeting Support',
    productId: 'meeting-support',
  });

  if (error) return res.status(500).json({ error: String(error) });
  res
    .setHeader('Content-Type', 'text/calendar; charset=utf-8')
    .setHeader('Content-Disposition', `attachment; filename="${mtg.id}.ics"`)
    .setHeader('Content-Transfer-Encoding', '8bit') // なくてもOK
    .send(bom + value);
}
