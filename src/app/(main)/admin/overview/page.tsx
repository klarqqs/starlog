import type { Metadata } from 'next';
import { OperatorOverviewPage } from './OperatorOverviewPage';

export default function () {
  return <OperatorOverviewPage />;
}

export const metadata: Metadata = {
  title: 'Overview',
};
