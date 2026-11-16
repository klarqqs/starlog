'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getClientAuthToken } from '@/lib/client';
import { LAST_TEAM_CONFIG } from '@/lib/constants';
import { getItem } from '@/lib/storage';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const lastTeam = getItem(LAST_TEAM_CONFIG);

    // Without a token we already know the user is logged out; skip the /websites.
    if (!process.env.cloudMode && !getClientAuthToken()) {
      router.replace('/home');
    } else if (lastTeam) {
      router.replace(`/teams/${lastTeam}/websites`);
    } else {
      router.replace('/overview');
    }
  }, [router]);

  return null;
}
