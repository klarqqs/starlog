import { expect, test } from 'vitest';
import { landingGateScript } from './landing-gate';

function run(cloudMode: boolean, storage: Record<string, string>) {
  const replaced: string[] = [];
  const source = landingGateScript(cloudMode)
    .replace(/^<script>/, '')
    .replace(/<\/script>$/, '');
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

test('sends a signed-in project account to its overview', () => {
  expect(run(false, { 'umami.auth': JSON.stringify('token') })).toEqual(['/overview']);
});

test('sends a signed-in project account to overview even when a last team is stored', () => {
  expect(
    run(false, {
      'umami.auth': JSON.stringify('token'),
      'umami.last-team': JSON.stringify('team-1'),
    }),
  ).toEqual(['/overview']);
});

test('sends an operator or admin to the operator overview when stored in stellog.landing', () => {
  expect(
    run(false, {
      'umami.auth': JSON.stringify('token'),
      'stellog.landing': '/admin/overview',
    }),
  ).toEqual(['/admin/overview']);
});

test('sends an operator or admin to /admin/projects when stored in stellog.landing', () => {
  expect(
    run(false, {
      'umami.auth': JSON.stringify('token'),
      'stellog.landing': '/admin/projects',
    }),
  ).toEqual(['/admin/projects']);
});

test('sends an operator or admin to /admin/projects even when a last-team is stored', () => {
  expect(
    run(false, {
      'umami.auth': JSON.stringify('token'),
      'umami.last-team': JSON.stringify('team-1'),
      'stellog.landing': '/admin/projects',
    }),
  ).toEqual(['/admin/projects']);
});

test('keeps the app redirect in cloud mode when there is no local token', () => {
  expect(run(true, {})).toEqual(['/overview']);
});
