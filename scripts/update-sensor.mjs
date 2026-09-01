#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

export const DEFAULT_SENSOR_URL = 'https://sensecraft-hmi-api.seeed.cc/api/v1/user/device/iot_data/20227712';

export function parseSensorResponse(data) {
  if (!data || typeof data !== 'object') throw new Error('empty sensor response');
  const code = Number(data.code);
  if (Number.isFinite(code) && code !== 200 && code !== 0) {
    throw new Error(`SenseCraft API ${data.code}: ${data.message || data.msg || 'request rejected'}`);
  }
  const result = data.result || data.data || data;
  const sensor = {
    battery: result?.battery?.level,
    insideTemp: result?.sensor?.temp,
    insideHumidity: result?.sensor?.humidity
  };
  if (!Object.values(sensor).every((value) => Number.isFinite(Number(value)))) {
    throw new Error('missing sensor fields');
  }
  return sensor;
}

export async function updateSensor(options = {}) {
  const apiKey = String(options.apiKey ?? process.env.SENSECRAFT_API_KEY ?? '').trim();
  if (!apiKey) throw new Error('SENSECRAFT_API_KEY is required');
  const url = options.url || process.env.SENSECRAFT_DEVICE_URL || DEFAULT_SENSOR_URL;
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(url, {
    cache: 'no-store',
    headers: { 'api-key': apiKey }
  });
  if (!response.ok) throw new Error(`SenseCraft API HTTP ${response.status}`);
  const sensor = parseSensorResponse(await response.json());
  const output = {
    generated_at: (options.now || new Date()).toISOString(),
    source: 'sensecraft-hmi',
    device_id: url.split('/').pop(),
    ...sensor
  };
  const outputDir = path.resolve(options.outputDir || process.env.SENSOR_OUTPUT_DIR || REPO_ROOT);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'sensor.json'), `${JSON.stringify(output, null, 2)}\n`);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  updateSensor().then((sensor) => console.log(`Wrote sensor snapshot at ${sensor.generated_at}`)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
