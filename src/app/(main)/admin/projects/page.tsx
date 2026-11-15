import type { Metadata } from 'next';
import { OperatorProjectsPage } from './OperatorProjectsPage';

export default function () {
  return <OperatorProjectsPage />;
}

export const metadata: Metadata = {
  title: 'Projects',
};
