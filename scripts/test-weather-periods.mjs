#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const dashboardPath = new URL('../dashboard.html', import.meta.url);
const dashboardHtml = await readFile(dashboardPath, 'utf8');
const scriptMatch = dashboardHtml.match(/<script type="module">([\s\S]*?)<\/script>/);

assert.ok(scriptMatch, 'dashboard module script exists');

const dashboardScript = scriptMatch[1].replace(
  /\s+await init\(\);\s*$/,
  '\nObject.assign(globalThis.__hooks, { periodHoursForLabel, summarizeForecastPeriod });'
);

const context = {
  console,
  Intl,
  URLSearchParams,
  globalThis: { __hooks: {} }
};
context.globalThis.globalThis = context.globalThis;

vm.runInNewContext(dashboardScript, context);

const { periodHoursForLabel, summarizeForecastPeriod } = context.globalThis.__hooks;

function assertJsonEqual(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

assertJsonEqual(
  periodHoursForLabel('AM'),
  { start: 0, end: 11 },
  'AM uses all hourly entries from 00:00 through 11:00'
);

assertJsonEqual(
  periodHoursForLabel('PM'),
  { start: 12, end: 23 },
  'PM uses all hourly entries from 12:00 through 23:00'
);

const hourlyWeather = {
  hourly: {
    time: [
      '2026-05-20T00:00',
      '2026-05-20T01:00',
      '2026-05-20T02:00',
      '2026-05-20T03:00',
      '2026-05-20T04:00',
      '2026-05-20T05:00',
      '2026-05-20T06:00',
      '2026-05-20T07:00',
      '2026-05-20T08:00',
      '2026-05-20T09:00',
      '2026-05-20T10:00',
      '2026-05-20T11:00',
      '2026-05-20T12:00',
      '2026-05-20T13:00',
      '2026-05-20T14:00',
      '2026-05-20T15:00',
      '2026-05-20T16:00',
      '2026-05-20T17:00',
      '2026-05-20T18:00',
      '2026-05-20T19:00',
      '2026-05-20T20:00',
      '2026-05-20T21:00',
      '2026-05-20T22:00',
      '2026-05-20T23:00'
    ],
    weather_code: [
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
      61,
      95,
      95,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      61,
      61,
      61,
      61
    ],
    cloud_cover: [],
    precipitation_probability: [],
    precipitation: [],
    rain: [],
    showers: []
  }
};

assertJsonEqual(
  summarizeForecastPeriod(hourlyWeather, '2026-05-20', 'AM', 61),
  { type: 'cloud', label: 'Clouds' },
  'AM uses the majority icon across the full AM period'
);

assertJsonEqual(
  summarizeForecastPeriod(hourlyWeather, '2026-05-20', 'PM', 61),
  { type: 'sun', label: 'Clear' },
  'PM uses the majority icon across the full PM period'
);

console.log('weather period tests passed');
