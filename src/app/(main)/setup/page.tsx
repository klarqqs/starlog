import type { Metadata } from 'next';
import { SetupPage } from './SetupPage';

export default function () {
  return <SetupPage />;
}

export const metadata: Metadata = {
  title: 'Setup',
};
