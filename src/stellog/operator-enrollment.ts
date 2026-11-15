import prisma from '@/lib/prisma';
import { type EnrollmentStatus, statusForEnrollment } from '@/stellog/operator-report';

const KEY = 'enrollment_mode';
export type EnrollmentMode = 'open' | 'approval-required';

export async function getEnrollmentMode(): Promise<EnrollmentMode> {
  const row = await prisma.client.appSetting.findUnique({ where: { key: KEY } });
  return row?.value === 'approval-required' ? 'approval-required' : 'open';
}

export async function setEnrollmentMode(mode: EnrollmentMode) {
  await prisma.client.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: mode },
    update: { value: mode },
  });
  return mode;
}

export async function enrollmentStatusFor(
  isAdmin: boolean,
  teamId?: string | null,
): Promise<EnrollmentStatus> {
  let teamStatus: EnrollmentStatus | null = null;
  if (teamId) {
    const team = await prisma.client.team.findUnique({
      where: { id: teamId },
      select: { enrollmentStatus: true },
    });
    if (team?.enrollmentStatus === 'pending' || team?.enrollmentStatus === 'active') {
      teamStatus = team.enrollmentStatus;
    }
  }
  return statusForEnrollment(await getEnrollmentMode(), isAdmin, teamStatus);
}
