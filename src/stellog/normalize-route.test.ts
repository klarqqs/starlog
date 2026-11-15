import { describe, expect, test } from 'vitest';
import { normalizeRoute, resolveHttpRoute } from './normalize-route';

const account = `G${'A'.repeat(55)}`;
const contract = `C${'B'.repeat(55)}`;
const muxed = `M${'C'.repeat(68)}`;
const uuid = '550e8400-e29b-41d4-a716-446655440000';
const hash = 'ab'.repeat(32);

describe('normalizeRoute', () => {
  test('replaces Stellar account, contract, and muxed address segments', () => {
    expect(account).toHaveLength(56);
    expect(contract).toHaveLength(56);
    expect(muxed).toHaveLength(69);
    expect(normalizeRoute(`/payments/${account}/contracts/${contract}/muxed/${muxed}`)).toBe(
      '/payments/{account}/contracts/{contract}/muxed/{muxed}',
    );
  });

  test('replaces UUIDs, hex hashes, and numeric ids', () => {
    expect(normalizeRoute(`/users/${uuid}/files/${hash}/orders/42`)).toBe(
      '/users/{uuid}/files/{hash}/orders/{id}',
    );
  });

  test('accepts an 0x hash and a 40 character hash, and leaves short hex alone', () => {
    expect(normalizeRoute(`/tx/0x${'cd'.repeat(32)}`)).toBe('/tx/{hash}');
    expect(normalizeRoute(`/tx/${'ab'.repeat(20)}`)).toBe('/tx/{hash}');
    expect(normalizeRoute('/tx/deadbeef')).toBe('/tx/deadbeef');
  });

  test('strips query strings, fragments, and trailing slashes', () => {
    expect(normalizeRoute(`/accounts/${account}/?cursor=abc&page=2`)).toBe('/accounts/{account}');
    expect(normalizeRoute(`/accounts/${uuid}#section`)).toBe('/accounts/{uuid}');
    expect(normalizeRoute('/health/')).toBe('/health');
    expect(normalizeRoute('/')).toBe('/');
    expect(normalizeRoute('/?q=1')).toBe('/');
  });

  test('does not treat a query-string address as part of the route', () => {
    expect(normalizeRoute(`/pay?account=${account}`)).toBe('/pay');
  });

  test('normalizes an absolute URL down to its path', () => {
    expect(normalizeRoute(`https://example.com/accounts/123/items/7/?x=1`)).toBe(
      '/accounts/{id}/items/{id}',
    );
  });

  test('keeps a template the caller already wrote', () => {
    expect(normalizeRoute('/payments/{id}/')).toBe('/payments/{id}');
  });

  test('decodes a numeric segment before classifying it', () => {
    expect(normalizeRoute('/orders/%31%32%33')).toBe('/orders/{id}');
  });

  test('empty input is the root route', () => {
    expect(normalizeRoute('')).toBe('/');
    expect(normalizeRoute(null)).toBe('/');
    expect(normalizeRoute(undefined)).toBe('/');
  });
});

describe('resolveHttpRoute', () => {
  test('uses http.route when the tenant set it, including a raw address in that field', () => {
    expect(resolveHttpRoute({ route: '/payments/{id}', path: `/payments/${account}` })).toBe(
      '/payments/{id}',
    );
    expect(resolveHttpRoute({ route: `/payments/${account}?x=1`, path: '/ignored' })).toBe(
      '/payments/{account}',
    );
  });

  test('falls back to the path when http.route is blank', () => {
    expect(resolveHttpRoute({ route: '  ', path: '/items/15/' })).toBe('/items/{id}');
  });
});
