#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const moduleUrl = new URL('./prepare-pages-site.mjs', import.meta.url);

test('prepares a Pages site with embedded and same-origin weather', async () => {
  assert.equal(existsSync(moduleUrl), true, 'Pages site preparer exists');
  const { preparePagesSite } = await import(moduleUrl);
  const root = await mkdtemp(path.join(os.tmpdir(), 'pok-pages-site-'));
  const sourceDir = path.join(root, 'source');
  const outputDir = path.join(root, 'output');
  const weatherPath = path.join(root, 'weather.json');
  const sensorPath = path.join(root, 'sensor.json');
  const marker = '<script id="weatherBootstrap" type="application/json"></script>';
  const weather = {
    generated_at: '2026-07-09T21:43:49.179Z',
    current: { temperature_2m: 24.5 },
    daily: { time: Array.from({ length: 6 }, () => '2026-07-09') }
  };
  const sensor = { generated_at: '2026-09-01T20:00:00.000Z', battery: 100, insideTemp: 30.2, insideHumidity: 50.4 };

  try {
    await mkdir(path.join(sourceDir, '.github'), { recursive: true });
    await writeFile(path.join(sourceDir, 'index.html'), 'photo page');
    await writeFile(path.join(sourceDir, 'dashboard.html'), `${marker}\n<script type="module"></script>`);
    await writeFile(path.join(sourceDir, '.github', 'private.txt'), 'not deployed');
    await writeFile(weatherPath, `${JSON.stringify(weather)}\n`);
    await writeFile(sensorPath, `${JSON.stringify(sensor)}\n`);
    await writeFile(path.join(sourceDir, 'dashboard.html'), `${marker}\n<script id="sensorBootstrap" type="application/json"></script>\n<script type="module"></script>`);

    await preparePagesSite({ sourceDir, weatherPath, sensorPath, outputDir });

    const dashboard = await readFile(path.join(outputDir, 'dashboard.html'), 'utf8');
    const deployedWeather = JSON.parse(await readFile(path.join(outputDir, 'weather.json'), 'utf8'));

    assert.match(dashboard, /<script id="weatherBootstrap" type="application\/json">\{.+\}<\/script>/);
    assert.doesNotMatch(dashboard, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(JSON.stringify(deployedWeather), JSON.stringify(weather));
    assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'sensor.json'), 'utf8')), sensor);
    assert.match(dashboard, /id="sensorBootstrap" type="application\/json">\{/);
    assert.equal(await readFile(path.join(outputDir, 'index.html'), 'utf8'), 'photo page');
    assert.equal(existsSync(path.join(outputDir, '.github')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
