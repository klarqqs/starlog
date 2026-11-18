/** A project route only, so `/projects/undefined` does not open the nested nav. */
export const PROJECT_PATH =
  /\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/**
 * Side navigation for a Stellar project account.
 * Websites and APIs stay inside a project. These items cover the whole account.
 */
export const PROJECT_NAV = [
  { id: 'overview', label: 'Overview', path: '/overview' },
  { id: 'projects', label: 'Projects', path: '/projects' },
  { id: 'realtime', label: 'Realtime', path: '/reports/realtime' },
  { id: 'events', label: 'Events', path: '/reports/events' },
  { id: 'compare', label: 'Compare', path: '/reports/compare' },
  { id: 'settings', label: 'Settings', path: '/settings/profile' },
] as const;

/** Side navigation for an SCF operator. Items marked adminOnly are hidden from the read-only operator. */
export const OPERATOR_NAV = [
  { id: 'overview', label: 'Overview', path: '/admin/overview', adminOnly: false },
  { id: 'projects', label: 'Projects', path: '/admin/projects', adminOnly: false },
  { id: 'realtime', label: 'Realtime', path: '/reports/realtime', adminOnly: false },
  { id: 'events', label: 'Events', path: '/reports/events', adminOnly: false },
  { id: 'compare', label: 'Compare', path: '/reports/compare', adminOnly: false },
  { id: 'enrollment', label: 'Enrollment', path: '/admin/enrollment', adminOnly: true },
  { id: 'operator-keys', label: 'Operator keys', path: '/admin/operator-keys', adminOnly: true },
  { id: 'operators', label: 'Operators', path: '/admin/users', adminOnly: true },
  { id: 'security', label: 'Security', path: '/admin/security', adminOnly: true },
  { id: 'settings', label: 'Settings', path: '/settings/profile', adminOnly: false },
] as const;

/** Website sections the RFP does not ask for. The routes stay so an upstream merge can keep them. */
export const HIDDEN_WEBSITE_NAV = new Set([
  'replays',
  'heatmaps',
  'revenue',
  'search-console',
  'google-ads',
]);

export function operatorNav(isAdmin: boolean) {
  return OPERATOR_NAV.filter(item => isAdmin || !item.adminOnly);
}

/**
 * Website report sections, opened across every project the account can see.
 * Replay, heatmaps, revenue, search console, and ads stay off this list.
 */
export const PROJECT_REPORT_NAV = [
  {
    label: 'Traffic',
    items: [
      { id: 'events', label: 'Events', path: '/reports/events' },
      { id: 'sessions', label: 'Sessions', path: '/reports/sessions' },
      { id: 'compare', label: 'Compare', path: '/reports/compare' },
      { id: 'breakdown', label: 'Breakdown', path: '/reports/breakdown' },
    ],
  },
  {
    label: 'Behavior',
    items: [
      { id: 'goals', label: 'Goals', path: '/reports/goals' },
      { id: 'funnels', label: 'Funnels', path: '/reports/funnels' },
      { id: 'journeys', label: 'Journeys', path: '/reports/journeys' },
      { id: 'retention', label: 'Retention', path: '/reports/retention' },
    ],
  },
  {
    label: 'Audience',
    items: [
      { id: 'segments', label: 'Segments', path: '/reports/segments' },
      { id: 'cohorts', label: 'Cohorts', path: '/reports/cohorts' },
    ],
  },
  {
    label: 'Growth',
    items: [
      { id: 'utm', label: 'UTM', path: '/reports/utm' },
      { id: 'attribution', label: 'Attribution', path: '/reports/attribution' },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { id: 'realtime', label: 'Realtime', path: '/reports/realtime' },
      { id: 'performance', label: 'Performance', path: '/reports/performance' },
      { id: 'errors', label: 'Errors', path: '/reports/errors' },
      { id: 'api', label: 'API', path: '/apis' },
    ],
  },
] as const;

export const PROJECT_REPORT_SECTIONS = [
  'events',
  'sessions',
  'compare',
  'breakdown',
  'goals',
  'funnels',
  'journeys',
  'retention',
  'segments',
  'cohorts',
  'utm',
  'attribution',
  'realtime',
  'performance',
  'errors',
] as const;

export function reportLabel(section: string) {
  for (const group of PROJECT_REPORT_NAV) {
    for (const item of group.items) {
      if (item.id === section) return item.label;
    }
  }
  return 'Report';
}

export function isReadOnlyOperator(
  user?: { isAdmin?: boolean; isOperator?: boolean; role?: string } | null,
) {
  return !!user && user.isAdmin !== true && (user.isOperator === true || user.role === 'operator');
}
