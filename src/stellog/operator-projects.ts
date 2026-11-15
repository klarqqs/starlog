import prisma from '@/lib/prisma';
import { deleteTeam } from '@/queries/prisma/team';
import { deleteWebsite } from '@/queries/prisma/website';
import { type ProjectType, parseProjectId } from '@/stellog/operator-report';

export async function removeProject(type: ProjectType, id: string) {
  if (type === 'team') {
    const team = await prisma.client.team.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!team) return false;
    await deleteTeam(id);
    return true;
  }

  const website = await prisma.client.website.findFirst({
    where: { id, teamId: null, deletedAt: null },
    select: { id: true },
  });
  if (!website) return false;
  await deleteWebsite(id);
  return true;
}

export async function approveProject(type: ProjectType, id: string) {
  if (type === 'team') {
    const team = await prisma.client.team.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!team) return false;
    await prisma.client.team.update({ where: { id }, data: { enrollmentStatus: 'active' } });
    await prisma.client.website.updateMany({
      where: { teamId: id, deletedAt: null },
      data: { enrollmentStatus: 'active' },
    });
    return true;
  }

  const website = await prisma.client.website.findFirst({
    where: { id, teamId: null, deletedAt: null },
    select: { id: true },
  });
  if (!website) return false;
  await prisma.client.website.update({ where: { id }, data: { enrollmentStatus: 'active' } });
  return true;
}

export function projectPath(type: string, id: string) {
  return parseProjectId(`${type}:${id}`);
}
