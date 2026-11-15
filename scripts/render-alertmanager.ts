import { writeFile } from 'node:fs/promises';
import { renderAlertmanagerConfig } from '../src/stellog/ops-baseline.ts';

const url = process.env.ALERT_WEBHOOK_URL;
if (!url) {
  console.error('Set ALERT_WEBHOOK_URL to the receiver that should page.');
  process.exit(2);
}

const file = 'infra/monitoring/alertmanager.generated.yml';
await writeFile(file, renderAlertmanagerConfig(url));
console.log(file);
