'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import {
  Button,
  Column,
  DataColumn,
  DataTable,
  Dialog,
  DialogTrigger,
  Form,
  FormButtons,
  FormField,
  FormSubmitButton,
  Icon,
  Modal,
  Row,
  Text,
  TextField,
} from '@umami/react-zen';
import { DataGrid } from '@/components/common/DataGrid';
import { DateDistance } from '@/components/common/DateDistance';
import { EmptyCard } from '@/components/common/EmptyPlaceholder';
import Link from '@/components/common/Link';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import {
  useApi,
  useLoginQuery,
  useMessages,
  useModified,
  useMyOverviewQuery,
  useNavigation,
  useUpdateQuery,
} from '@/components/hooks';
import { Plus } from '@/components/icons';
import { DateFilter } from '@/components/input/DateFilter';
import { ROLES } from '@/lib/constants';
import { formatLongNumber } from '@/lib/format';
import type { PageResult } from '@/lib/types';
import type { MySite } from '@/stellog/my-overview';
import { propertyLabel } from '@/stellog/operator-report';
import { isReadOnlyOperator } from '@/stellog/project-nav';

type TeamRow = {
  id: string;
  name: string;
  createdAt: string;
};

type ProjectRow = {
  id: string;
  name: string;
  href: string;
  sites: number;
  apis: number;
  pageviews: number;
  visitors: number;
  requests: number;
  createdAt: string | null;
};

export function ProjectsPage() {
  const { user } = useLoginQuery();
  const { get, useQuery } = useApi();
  const { modified } = useModified('teams');
  const { query } = useNavigation();
  const overview = useMyOverviewQuery();
  const canAdd = !!user && user.role !== ROLES.viewOnly && !isReadOnlyOperator(user);
  const teamsQuery = useQuery({
    queryKey: ['my-projects', user?.id, modified],
    queryFn: () =>
      get(`/users/${user.id}/teams`, { page: 1, pageSize: 100 }) as Promise<{ data: TeamRow[] }>,
    enabled: !!user?.id,
  });
  const search = `${query.search || ''}`.trim().toLowerCase();
  const settled = !teamsQuery.isLoading && !overview.isLoading;
  const loaded = Boolean(teamsQuery.data || overview.data);
  const allRows = projectRows(teamsQuery.data?.data ?? [], overview.data?.sites ?? []);
  const rows = allRows.filter(row => {
    if (!search) return true;
    return row.name.toLowerCase().includes(search);
  });
  const failed = settled && allRows.length === 0 && Boolean(teamsQuery.error || overview.error);
  const tableQuery = {
    ...teamsQuery,
    isLoading: !settled && rows.length === 0,
    error: failed ? teamsQuery.error || overview.error : null,
    data: loaded
      ? { data: rows, count: rows.length, page: 1, pageSize: rows.length || 1 }
      : undefined,
  } as UseQueryResult<PageResult<ProjectRow[]>, Error>;

  return (
    <PageBody>
      <Column margin="2" gap="6">
        <PageHeader title="Projects">
          <Row gap="3" alignItems="center">
            <DateFilter value={overview.value} onChange={overview.setValue} showAllTime={false} />
            {canAdd && <CreateProjectButton />}
          </Row>
        </PageHeader>
        <Text color="muted">A project holds a website, an API, or both.</Text>
        <Panel>
          <LoadingPanel
            data={tableQuery.data}
            isLoading={!settled && rows.length === 0}
            error={failed ? teamsQuery.error || overview.error : undefined}
            isEmpty={settled && allRows.length === 0 && !failed}
            renderEmpty={() => (
              <EmptyCard
                title="No projects"
                description="Create a project, then add a website or an API."
              >
                {canAdd && <CreateProjectButton />}
              </EmptyCard>
            )}
          >
            <DataGrid query={tableQuery} allowSearch allowPaging={false}>
              {() => (
                <DataTable data={rows}>
                  <DataColumn id="name" label="Project" style={{ minWidth: 0 }}>
                    {(row: ProjectRow) => <Link href={row.href}>{row.name}</Link>}
                  </DataColumn>
                  <DataColumn id="properties" label="Properties">
                    {(row: ProjectRow) => propertyLabel(row.sites, row.apis)}
                  </DataColumn>
                  <DataColumn id="pageviews" label="Pageviews" align="end">
                    {(row: ProjectRow) => formatLongNumber(row.pageviews)}
                  </DataColumn>
                  <DataColumn id="visitors" label="Visitors" align="end">
                    {(row: ProjectRow) => formatLongNumber(row.visitors)}
                  </DataColumn>
                  <DataColumn id="requests" label="API requests" align="end">
                    {(row: ProjectRow) => formatLongNumber(row.requests)}
                  </DataColumn>
                  <DataColumn id="created" label="Created" width="160px">
                    {(row: ProjectRow) =>
                      row.createdAt ? <DateDistance date={new Date(row.createdAt)} /> : '—'
                    }
                  </DataColumn>
                </DataTable>
              )}
            </DataGrid>
          </LoadingPanel>
        </Panel>
      </Column>
    </PageBody>
  );
}

export function CreateProjectButton() {
  const { mutateAsync, error, isPending, touch } = useUpdateQuery('/teams');
  const { getErrorMessage } = useMessages();
  const { router } = useNavigation();

  return (
    <DialogTrigger>
      <Button variant="primary">
        <Icon>
          <Plus />
        </Icon>
        <Text>Create project</Text>
      </Button>
      <Modal>
        <Dialog title="Create project" style={{ width: 400 }}>
          {({ close }) => (
            <Form
              error={getErrorMessage(error)}
              onSubmit={async (data: { name: string }) => {
                const created = (await mutateAsync({ name: data.name })) as { id?: string };
                if (!created?.id) {
                  throw new Error('The project was created without an id.');
                }
                touch('teams');
                close();
                router.push(`/projects/${created.id}`);
              }}
            >
              <FormField name="name" label="Name">
                <TextField autoComplete="off" />
              </FormField>
              <Text color="muted">You can add a website or an API on the next screen.</Text>
              <FormButtons>
                <Button onPress={close} isDisabled={isPending}>
                  Cancel
                </Button>
                <FormSubmitButton variant="primary" isDisabled={isPending}>
                  Create
                </FormSubmitButton>
              </FormButtons>
            </Form>
          )}
        </Dialog>
      </Modal>
    </DialogTrigger>
  );
}

function projectRows(teams: TeamRow[], sites: MySite[]): ProjectRow[] {
  const byTeam = new Map<string, MySite[]>();
  for (const site of sites) {
    if (!site.teamId) continue;
    const owned = byTeam.get(site.teamId) ?? [];
    owned.push(site);
    byTeam.set(site.teamId, owned);
  }

  const seen = new Set<string>();
  const rows: ProjectRow[] = teams.map(team => {
    seen.add(team.id);
    return {
      id: team.id,
      name: team.name,
      href: `/projects/${team.id}`,
      ...totals(byTeam.get(team.id) ?? []),
      createdAt: team.createdAt,
    };
  });

  for (const [teamId, owned] of byTeam) {
    if (seen.has(teamId)) continue;
    rows.push({
      id: teamId,
      name: owned.find(site => site.teamName)?.teamName || 'Project',
      href: `/projects/${teamId}`,
      ...totals(owned),
      createdAt: null,
    });
  }

  for (const site of sites.filter(item => !item.teamId)) {
    rows.push({
      id: site.websiteId,
      name: site.name,
      href: site.kind === 'api' ? `/websites/${site.websiteId}/api` : `/websites/${site.websiteId}`,
      sites: site.kind === 'api' ? 0 : 1,
      apis: site.kind === 'api' ? 1 : 0,
      pageviews: site.pageviews,
      visitors: site.visitors,
      requests: site.requests,
      createdAt: null,
    });
  }

  return rows.sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name));
}

function totals(sites: MySite[]) {
  return sites.reduce(
    (sum, site) => ({
      sites: sum.sites + (site.kind === 'api' ? 0 : 1),
      apis: sum.apis + (site.kind === 'api' ? 1 : 0),
      pageviews: sum.pageviews + site.pageviews,
      visitors: sum.visitors + site.visitors,
      requests: sum.requests + site.requests,
    }),
    { sites: 0, apis: 0, pageviews: 0, visitors: 0, requests: 0 },
  );
}
