#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseSensorResponse, updateSensor } from './update-sensor.mjs';

test('parses a valid SenseCraft sensor response', () => {
  assert.deepEqual(parseSensorResponse({
    code: 200,
    result: { battery: { level: 100 }, sensor: { temp: 30.2, humidity: 50.4 } }
  }), { battery: 100, insideTemp: 30.2, insideHumidity: 50.4 });
});

test('rejects application-level SenseCraft errors', () => {
  assert.throws(() => parseSensorResponse({ code: 9003, message: 'API key is missing' }), /SenseCraft API 9003/);
});

test('writes a keyless sensor snapshot without logging the API key', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'pok-sensor-'));
  try {
    const sensor = await updateSensor({
      apiKey: 'test-secret',
      outputDir,
      now: new Date('2026-09-01T20:00:00.000Z'),
      fetchImpl: async (_url, options) => {
        assert.equal(options.headers['api-key'], 'test-secret');
        return { ok: true, async json() { return { code: 200, result: { battery: { level: 99 }, sensor: { temp: 30.1, humidity: 49.9 } } }; } };
      }
    });
    assert.deepEqual(sensor, { generated_at: '2026-09-01T20:00:00.000Z', source: 'sensecraft-hmi', device_id: '20227712', battery: 99, insideTemp: 30.1, insideHumidity: 49.9 });
    assert.doesNotMatch(await readFile(path.join(outputDir, 'sensor.json'), 'utf8'), /test-secret/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
