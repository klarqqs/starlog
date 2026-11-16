import type { Metadata } from 'next';
import { OperatorKeysPage } from './OperatorKeysPage';

export default function () {
  return <OperatorKeysPage />;
}

export const metadata: Metadata = {
  title: 'Operator keys',
};
