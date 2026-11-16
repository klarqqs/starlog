import prisma from '@/lib/prisma';
import { deleteTeam } from '@/queries/prisma/team';

/** Removes one distinct id from a website. Sessions stay, without that identifier. */
export async function eraseDistinctId(websiteId: string, distinctId: string) {
  const [links, data, sessions] = await Promise.all([
    prisma.client.sessionLink.deleteMany({ where: { websiteId, distinctId } }),
    prisma.client.sessionData.deleteMany({ where: { websiteId, distinctId } }),
    prisma.client.session.updateMany({
      where: { websiteId, distinctId },
      data: { distinctId: null },
    }),
  ]);
  return { links: links.count, data: data.count, sessions: sessions.count };
}

/** Deletes a team, its websites, and the rows those websites own, including ingest keys. */
export async function eraseTenant(teamId: string) {
  await deleteTeam(teamId);
}
