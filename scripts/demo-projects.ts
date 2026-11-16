/** SCF #45, #44, and #43 award winners used by the synthetic demo. */
export const DEMO_PROJECTS = [
  { name: 'Sorted', domain: 'sorted.io' },
  { name: 'Tilt Pay', domain: 'tilt-pay.com' },
  { name: 'Minisend', domain: 'minisend.xyz' },
  { name: 'Neko', domain: 'nekoprotocol.xyz' },
  { name: 'Lunar Finance', domain: 'lunarfinance.io' },
  { name: 'PigFi', domain: 'pigfi.app' },
  { name: 'Sendana', domain: 'usesendana.com' },
  { name: 'Kutana', domain: 'kutanapay.com' },
  { name: 'Liqvid', domain: 'liqvid.xyz' },
  { name: 'Azza', domain: 'useazza.com' },
  { name: 'LumAgg', domain: 'lumagg.xyz' },
  { name: 'Lucent', domain: 'starusd.xyz' },
  { name: 'Bluechip', domain: 'bluechip.org' },
  { name: 'ROZO', domain: 'rozo.ai' },
  { name: 'VERSO', domain: 'versotek.io' },
  { name: 'Authline', domain: 'authline.io' },
  { name: 'Bexo', domain: 'bexo.app' },
  { name: 'Blink', domain: 'ourblink.cash' },
  { name: 'Remi', domain: 'remi.ae' },
  { name: 'Blockroll', domain: 'blockroll.app' },
  { name: 'JetPad', domain: 'jetpad.finance' },
  { name: 'Sava', domain: 'getsava.app' },
  { name: 'ProofBridge', domain: 'pfbridge.xyz' },
  { name: 'Pipeline', domain: 'pipeline.one' },
  { name: 'XCCY', domain: 'xccy.finance' },
] as const;

/** Spread property creation across the past year so the list is not all the same moment. */
export function propertyCreatedAt(index: number, kind: 'team' | 'site' | 'api', now = new Date()) {
  const extra = kind === 'team' ? 9 : kind === 'api' ? 4 : 0;
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - (16 + index * 13 + extra));
  date.setUTCHours(8 + (index % 10), (index * 17) % 60, 0, 0);
  return date;
}
