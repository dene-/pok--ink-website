#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const dashboardPath = new URL('../dashboard.html', import.meta.url);
const dashboardHtml = await readFile(dashboardPath, 'utf8');
const scriptMatch = dashboardHtml.match(/<script type="module">([\s\S]*?)<\/script>/);

assert.ok(scriptMatch, 'dashboard module script exists');
assert.match(
  dashboardHtml,
  /<script id="weatherBootstrap" type="application\/json"><\/script>/,
  'dashboard exposes an empty artifact-time weather bootstrap slot'
);

const dashboardScript = scriptMatch[1].replace(
  /\s+await init\(\);\s*$/,
  '\nObject.assign(globalThis.__hooks, { applyForecastBias, isUsableBiasModel, periodHoursForLabel, summarizeForecastPeriod, validateGeneratedWeatherData: typeof validateGeneratedWeatherData === "function" ? validateGeneratedWeatherData : null, fetchWeatherWithOptionalBias: typeof fetchWeatherWithOptionalBias === "function" ? fetchWeatherWithOptionalBias : null, parseEmbeddedWeather: typeof parseEmbeddedWeather === "function" ? parseEmbeddedWeather : null });'
);

const context = {
  console,
  Intl,
  URLSearchParams,
  globalThis: { __hooks: {} }
};
context.globalThis.globalThis = context.globalThis;

vm.runInNewContext(dashboardScript, context);

const {
  applyForecastBias,
  isUsableBiasModel,
  periodHoursForLabel,
  summarizeForecastPeriod,
  validateGeneratedWeatherData,
  fetchWeatherWithOptionalBias,
  parseEmbeddedWeather
} = context.globalThis.__hooks;

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
  {
    type: 'cloud',
    label: 'Clouds',
    wet: false,
    precipitationTotalMm: 0,
    maxPrecipitationProbability: 0
  },
  'AM uses the majority icon across the full AM period'
);

assertJsonEqual(
  summarizeForecastPeriod(hourlyWeather, '2026-05-20', 'PM', 61),
  {
    type: 'sun',
    label: 'Clear',
    wet: false,
    precipitationTotalMm: 0,
    maxPrecipitationProbability: 0
  },
  'PM uses the majority icon across the full PM period'
);

const unsupportedRain = {
  hourly: {
    time: hourlyWeather.hourly.time,
    weather_code: Array.from({ length: 24 }, () => 61),
    cloud_cover: Array.from({ length: 24 }, () => 80),
    precipitation_probability: Array.from({ length: 24 }, () => 0),
    precipitation: Array.from({ length: 24 }, () => 0),
    rain: Array.from({ length: 24 }, () => 0),
    showers: Array.from({ length: 24 }, () => 0)
  }
};

assertJsonEqual(
  summarizeForecastPeriod(unsupportedRain, '2026-05-20', 'AM', 61),
  {
    type: 'cloud',
    label: 'Clouds',
    wet: false,
    precipitationTotalMm: 0,
    maxPrecipitationProbability: 0
  },
  'Forecast rain without precipitation support downgrades to a dry cloud period'
);

assert.equal(
  isUsableBiasModel({
    schemaVersion: 2,
    generated_at: '2026-05-20T06:00:00.000Z',
    maxAgeHours: 36,
    location: { latitude: 41.3474, longitude: 2.0431, timezone: 'Europe/Madrid' },
    forecastSource: 'open-meteo',
    forecastModel: 'open-meteo-best-match',
    adjustments: {}
  }, new Date('2026-05-20T18:00:00.000Z')),
  true,
  'Fresh matching bias model is usable'
);

assert.equal(
  isUsableBiasModel({
    schemaVersion: 2,
    generated_at: '2026-05-18T06:00:00.000Z',
    maxAgeHours: 36,
    location: { latitude: 41.3474, longitude: 2.0431, timezone: 'Europe/Madrid' },
    forecastSource: 'open-meteo',
    forecastModel: 'open-meteo-best-match',
    adjustments: {}
  }, new Date('2026-05-20T18:00:00.000Z')),
  false,
  'Stale bias model is ignored'
);

const now = new Date();
const yesterday = new Date(now);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayIso = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(yesterday);

assert.doesNotThrow(
  () => validateGeneratedWeatherData({
    current: {},
    daily: { time: Array.from({ length: 6 }, () => yesterdayIso) },
    generated_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
  }, now),
  'recent generated weather remains usable after a missed overnight update'
);

assert.throws(
  () => validateGeneratedWeatherData({
    current: { temperature_2m: 18.5 },
    daily: { time: Array.from({ length: 6 }, () => yesterdayIso) },
    generated_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
  }, now, 90 * 60 * 1000, true),
  /stale generated weather\.json/,
  'published weather older than the emergency threshold is rejected'
);

assert.equal(typeof parseEmbeddedWeather, 'function', 'embedded weather parser exists');
const embeddedWeather = parseEmbeddedWeather(JSON.stringify({
  current: { temperature_2m: 18.5 },
  daily: { time: Array.from({ length: 6 }, () => yesterdayIso) },
  generated_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
}), now);
assert.equal(embeddedWeather.current.temperature_2m, 18.5, 'fresh embedded weather is available synchronously');

const fetchStarts = [];
const weatherWithBias = await fetchWeatherWithOptionalBias(
  async () => {
    fetchStarts.push('weather');
    return { current: {}, daily: { time: [] } };
  },
  async () => {
    fetchStarts.push('bias');
    throw new Error('bias unavailable');
  }
);

assertJsonEqual(fetchStarts, ['weather', 'bias'], 'weather and optional bias fetches start together');
assert.equal(weatherWithBias.biasModel, null, 'weather remains usable when optional bias fetch fails');

assertJsonEqual(
  applyForecastBias({
    horizonDays: 1,
    minC: 10,
    maxC: 11,
    periods: {
      AM: { type: 'cloud', label: 'Clouds' },
      PM: { type: 'rain', label: 'Rain' }
    }
  }, {
    adjustments: {
      1: {
        minC: { applied: true, delta: 5 },
        maxC: { applied: true, delta: -5 },
        periods: {
          AM: { overrides: { cloud: 'snow' } },
          PM: { overrides: { rain: 'cloud' } }
        }
      }
    }
  }),
  {
    horizonDays: 1,
    minC: 10,
    maxC: 11,
    periods: {
      AM: { type: 'cloud', label: 'Clouds' },
      PM: { type: 'cloud', label: 'Clouds' }
    }
  },
  'Dashboard bias application shrinks inverted temperature corrections and guards warm snow'
);

console.log('weather period tests passed');
