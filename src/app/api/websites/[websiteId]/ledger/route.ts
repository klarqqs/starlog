import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { withDateRange } from '@/lib/schema';
import { canViewWebsiteSection } from '@/permissions';
import { readLedger } from '@/stellog/ledger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, query, error } = await parseRequest(request, withDateRange());
  if (error) return error();

  const { websiteId } = await params;
  if (!(await canViewWebsiteSection(auth, websiteId, 'events'))) return unauthorized();

  const filters = await getQueryFilters(query, websiteId);
  return json(await readLedger(websiteId, filters.startDate, filters.endDate));
}
