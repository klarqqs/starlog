import { expect, test } from 'vitest';
import { landingGateScript } from './landing-gate';

function run(cloudMode: boolean, storage: Record<string, string>) {
  const replaced: string[] = [];
  const source = landingGateScript(cloudMode).replace(/^<script>/, '').replace(/<\/script>$/, '');
  const gate = new Function('localStorage', 'location', source);
  gate(
    { getItem: (key: string) => (key in storage ? storage[key] : null) },
    { replace: (url: string) => replaced.push(url) },
  );
  return replaced;
}

test('leaves signed-out visitors on the landing page', () => {
  expect(run(false, {})).toEqual([]);
});

test('sends a signed-in user to the overview', () => {
  expect(run(false, { 'umami.auth': JSON.stringify('token') })).toEqual(['/overview']);
});

test('sends a signed-in user back to their last team', () => {
  expect(
    run(false, {
      'umami.auth': JSON.stringify('token'),
      'umami.last-team': JSON.stringify('team-1'),
    }),
  ).toEqual(['/teams/team-1/websites']);
});

test('keeps the app redirect in cloud mode when there is no local token', () => {
  expect(run(true, {})).toEqual(['/overview']);
});
