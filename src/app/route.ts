import { landingGateScript } from '@/lib/landing-gate';
import { marketingPage } from '@/lib/marketing';

export function GET() {
  const cloudMode = Boolean(process.env.cloudMode || process.env.CLOUD_MODE);
  return marketingPage('home.html', landingGateScript(cloudMode));
}
