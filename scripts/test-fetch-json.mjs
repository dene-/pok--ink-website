import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchJson } from './fetch-json.mjs';

test('aborts a hung response body and retries without exposing request secrets', async () => {
  let attempts = 0;
  const fetchImpl = async (_url, { signal }) => {
    attempts += 1;
    return { ok: true, json: () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('secret-url')), { once: true });
    }) };
  };
  await assert.rejects(fetchJson(fetchImpl, 'https://example.com/?key=secret', {
    attempts: 2, timeoutMs: 5, requestLabel: 'Test API'
  }), (error) => {
    assert.match(error.message, /Test API: request failed/);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
  assert.equal(attempts, 2);
});

test('recovers from a transient HTTP failure', async () => {
  let attempts = 0;
  const result = await fetchJson(async () => ++attempts === 1
    ? { ok: false, status: 503 }
    : { ok: true, json: async () => ({ temperature: 25 }) }, 'https://example.com', { attempts: 2 });
  assert.deepEqual(result, { temperature: 25 });
});
