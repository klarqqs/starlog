import type { Metadata } from 'next';
import { ApisPage } from './ApisPage';

export default function () {
  return <ApisPage />;
}

export const metadata: Metadata = {
  title: 'APIs',
};
