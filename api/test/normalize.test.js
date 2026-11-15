import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePath, bucketIndex, percentile } from '../src/metrics.js';

const account = `G${'A'.repeat(55)}`;
const muxed = `M${'A'.repeat(68)}`;

test('strips stellar addresses, uuids, hashes and numeric ids', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(normalizePath(`/accounts/${account}/payments`), '/accounts/:id/payments');
  assert.equal(normalizePath(`/muxed/${muxed}`), '/muxed/:id');
  assert.equal(normalizePath(`/tx/${id}/ops/4402`), '/tx/:id/ops/:id');
  assert.equal(normalizePath('/tx/' + 'ab'.repeat(32)), '/tx/:id');
  assert.equal(normalizePath('/health'), '/health');
});

test('latency buckets match the stored upper bounds', () => {
  assert.equal(bucketIndex(42), 2);
  assert.equal(bucketIndex(900), 6);
  assert.equal(percentile([0, 0, 1, 0, 0, 0, 1, 0, 0], 0.5), 50);
  assert.equal(percentile([0, 0, 1, 0, 0, 0, 1, 0, 0], 0.95), 1000);
});
