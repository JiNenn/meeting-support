import prisma from '../../prismaClient';

export class MeetingService {
  static async create({ title, purpose, organizerId }: {
    title: string; purpose: string; organizerId: string;
  }) {
    return prisma.meeting.create({
      data: { title, organizerId, purpose },
    });
  }

  static async findById(id: string) {
    return prisma.meeting.findUnique({
      where: { id },
      include: { members: { include: { member: true } } },
    });
  }
}
