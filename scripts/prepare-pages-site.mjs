#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const WEATHER_MARKER = '<script id="weatherBootstrap" type="application/json"></script>';
const SENSOR_MARKER = '<script id="sensorBootstrap" type="application/json"></script>';
const EXCLUDED_ROOT_ENTRIES = new Set(['.git', '.github', 'node_modules']);

export async function preparePagesSite({ sourceDir, weatherPath, sensorPath, outputDir }) {
  const source = path.resolve(sourceDir);
  const weatherFile = path.resolve(weatherPath);
  const sensorFile = path.resolve(sensorPath || process.env.SENSOR_PATH || path.join(path.dirname(weatherFile), 'sensor.json'));
  const output = path.resolve(outputDir);

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (EXCLUDED_ROOT_ENTRIES.has(entry.name)) continue;
    await cp(path.join(source, entry.name), path.join(output, entry.name), {
      recursive: entry.isDirectory()
    });
  }

  const weatherText = await readFile(weatherFile, 'utf8');
  let sensorText = 'null';
  try {
    sensorText = await readFile(sensorFile, 'utf8');
    JSON.parse(sensorText);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const weather = JSON.parse(weatherText);
  const dashboardPath = path.join(output, 'dashboard.html');
  const dashboard = await readFile(dashboardPath, 'utf8');
  if (!dashboard.includes(WEATHER_MARKER)) {
    throw new Error('dashboard weather bootstrap marker is missing');
  }
  if (!dashboard.includes(SENSOR_MARKER)) {
    throw new Error('dashboard sensor bootstrap marker is missing');
  }

  const serializedWeather = JSON.stringify(weather).replaceAll('<', '\\u003c');
  const embeddedDashboard = dashboard.replace(
    WEATHER_MARKER,
    `<script id="weatherBootstrap" type="application/json">${serializedWeather}</script>`
  );
  const embeddedWithSensor = embeddedDashboard.replace(
    SENSOR_MARKER,
    `<script id="sensorBootstrap" type="application/json">${sensorText.replaceAll('<', '\\u003c')}</script>`
  );

  await writeFile(dashboardPath, embeddedWithSensor);
  await writeFile(path.join(output, 'weather.json'), weatherText);
  await writeFile(path.join(output, 'sensor.json'), sensorText);
}

function requiredEnvironmentPath(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  preparePagesSite({
    sourceDir: REPO_ROOT,
    weatherPath: requiredEnvironmentPath('WEATHER_PATH'),
    outputDir: requiredEnvironmentPath('PAGES_OUTPUT_DIR')
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
