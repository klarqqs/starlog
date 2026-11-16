import type { Metadata } from 'next';
import { WalletsPage } from './WalletsPage';

export default function () {
  return <WalletsPage />;
}

export const metadata: Metadata = {
  title: 'Wallets',
};
