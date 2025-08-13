import prisma from '@backend/prismaClient';

export async function upsertGoogleTokens(
  userId: string,
  accessToken: string,
  refreshToken?: string,
) {
  await prisma.member.update({
    where: { id: userId },
    data:  {
      googleAccess:  accessToken,
      googleRefresh: refreshToken ?? '',
    },
  });
}
