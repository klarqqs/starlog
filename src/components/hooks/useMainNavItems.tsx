import {
  Activity,
  ChartColumn,
  Globe,
  LayoutDashboard,
  Settings,
  Wrench,
} from '@/components/icons';
import { isReadOnlyOperator, operatorViewNav, PROJECT_NAV } from '@/stellog/project-nav';
import { useLoginQuery } from './queries/useLoginQuery';

const icons = {
  overview: <LayoutDashboard />,
  websites: <Globe />,
  apis: <Activity />,
  setup: <Wrench />,
  settings: <Settings />,
  projects: <ChartColumn />,
};

/** The five tabs a Stellar project uses. A read-only operator also gets Projects. */
export function useMainNavItems() {
  const { user } = useLoginQuery();
  const showProjects = isReadOnlyOperator(user) || !!user?.isAdmin || user?.role === 'admin';
  const items = showProjects ? operatorViewNav() : PROJECT_NAV;

  return items.map(item => ({
    ...item,
    icon: icons[item.id],
  }));
}
