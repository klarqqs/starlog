import { Row } from '@umami/react-zen';

const ICONS: Record<string, string> = {
  USDC: 'usdc.svg',
  EURC: 'eurc.svg',
  XLM: 'xlm.svg',
};

/** Asset code with the same 16px mark used for browsers. */
export function AssetLabel({ asset }: { asset?: string | null }) {
  const code = asset?.trim();
  if (!code || code === '—') return '—';
  const file = ICONS[code.toUpperCase()];
  const src = file ? `${process.env.basePath || ''}/images/asset/${file}` : null;

  return (
    <Row gap="2" alignItems="center">
      {src && <img src={src} width={16} height={16} alt="" />}
      <span>{code.toUpperCase()}</span>
    </Row>
  );
}
