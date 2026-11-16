import { checkAuth, getBearerToken } from '@/lib/auth';
import { findActiveOperatorKey } from '@/stellog/operator-key';

const OPERATOR_PREFIX = 'opk_';

type Reader = { isAdmin?: boolean; role?: string } | null | undefined;

/** An administrator or the read-only operator role. An opk_ key is handled separately. */
export function canReadOperatorProjects(user: Reader) {
  return !!user && (user.isAdmin === true || user.role === 'operator');
}

/** Deletes, enrollment changes, and key creation stay with the administrator. */
export function canManageOperatorProjects(user: Reader) {
  return user?.isAdmin === true;
}

export async function authorizeOperatorRead(request: Request) {
  const token = getBearerToken(request);
  if (token?.startsWith(OPERATOR_PREFIX)) {
    return (await findActiveOperatorKey(token)) ? 'key' : null;
  }
  const auth = await checkAuth(request);
  return auth?.user?.isAdmin ? 'admin' : null;
}

/** Operator keys are read-only. A key never satisfies an admin mutation. */
export async function requireOperatorAdmin(request: Request) {
  const token = getBearerToken(request);
  if (token?.startsWith(OPERATOR_PREFIX)) return null;
  const auth = await checkAuth(request);
  return auth?.user?.isAdmin ? auth : null;
}
