import {
  ChartColumn,
  GitCompare,
  LayoutDashboard,
  MousePointerClick,
  Radio,
  Settings,
} from '@/components/icons';
import { PROJECT_NAV } from '@/stellog/project-nav';

const icons = {
  overview: <LayoutDashboard />,
  projects: <ChartColumn />,
  realtime: <Radio />,
  events: <MousePointerClick />,
  compare: <GitCompare />,
  settings: <Settings />,
};

/** The tenant shell. Operators use the SCF nav instead. */
export function useMainNavItems() {
  return PROJECT_NAV.map(item => ({
    ...item,
    icon: icons[item.id],
  }));
}
