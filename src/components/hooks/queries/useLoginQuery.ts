import { removeClientAuthToken } from '@/lib/client';
import { setUser, useApp } from '@/store/app';
import { useApi } from '../useApi';

const selector = (state: { user: any }) => state.user;

export function useLoginQuery() {
  const { post, useQuery } = useApi();
  const user = useApp(selector);

  const query = useQuery({
    queryKey: ['login'],
    queryFn: async () => {
      try {
        const data = await post('/auth/verify');

        setUser(data);

        return data;
      } catch (err) {
        removeClientAuthToken();
        try {
          localStorage.removeItem('stellog.landing');
        } catch {}
        throw err;
      }
    },
    enabled: !user,
  });

  return { user, setUser, ...query };
}
