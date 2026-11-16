import { expect, test } from 'vitest';
import { DOMAIN_REGEX } from './constants';

test('website domains accept a loopback address with the page port', () => {
  expect(DOMAIN_REGEX.test('127.0.0.1:3000')).toBe(true);
  expect(DOMAIN_REGEX.test('127.0.0.1')).toBe(true);
  expect(DOMAIN_REGEX.test('localhost:3000')).toBe(true);
  expect(DOMAIN_REGEX.test('example.com')).toBe(true);
  expect(DOMAIN_REGEX.test('256.1.1.1')).toBe(false);
  expect(DOMAIN_REGEX.test('not a domain')).toBe(false);
});
