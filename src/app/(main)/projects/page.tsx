import type { Metadata } from 'next';
import { ProjectsPage } from './ProjectsPage';

export default function () {
  return <ProjectsPage />;
}

export const metadata: Metadata = {
  title: 'Projects',
};
