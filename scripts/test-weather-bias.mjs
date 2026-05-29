#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyForecastBias,
  buildBiasModel,
  captureForecastSnapshots,
  deriveActualDay,
  getReadyTargetDates,
  isUsableBiasModel,
  locationKey,
  normalizeHistory,
  resolveSnapshotsWithActuals,
  trimHistory
} from './weather-bias-lib.mjs';
import { runWeatherUpdate } from './update-weather.mjs';

const LOCATION = {
  latitude: 41.3474,
  longitude: 2.0431,
  timezone: 'Europe/Madrid'
};

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildHourly(startDate, days, code = 2, precipitation = 0, precipitationProbability = 0) {
  const time = [];
  const weatherCode = [];
  const cloudCover = [];
  const probability = [];
  const precip = [];
  const rain = [];
  const showers = [];

  for (let day = 0; day < days; day += 1) {
    const isoDate = addDays(startDate, day);
    for (let hour = 0; hour < 24; hour += 1) {
      time.push(`${isoDate}T${String(hour).padStart(2, '0')}:00`);
      weatherCode.push(code);
      cloudCover.push(code === 0 ? 0 : 80);
      probability.push(precipitationProbability);
      precip.push(precipitation);
      rain.push(precipitation);
      showers.push(0);
    }
  }

  return {
    time,
    weather_code: weatherCode,
    cloud_cover: cloudCover,
    precipitation_probability: probability,
    precipitation: precip,
    rain,
    showers
  };
}

function buildForecast(startDate = '2026-05-29') {
  const dates = Array.from({ length: 6 }, (_value, index) => addDays(startDate, index));

  return {
    latitude: LOCATION.latitude,
    longitude: LOCATION.longitude,
    timezone: LOCATION.timezone,
    current: {
      time: `${startDate}T06:00`,
      temperature_2m: 20,
      relative_humidity_2m: 50,
      weather_code: 2,
      wind_speed_10m: 4,
      wind_direction_10m: 180,
      is_day: 1
    },
    hourly: buildHourly(startDate, 6, 2, 0, 0),
    daily: {
      time: dates,
      weather_code: [2, 61, 2, 2, 2, 2],
      temperature_2m_min: [12, 11, 12, 13, 14, 15],
      temperature_2m_max: [22, 21, 22, 23, 24, 25],
      wind_speed_10m_max: [10, 11, 12, 13, 14, 15]
    }
  };
}

function resolvedSnapshot({
  issuedAt = '2026-05-01T04:00:00.000Z',
  issueBucket = 'morning',
  horizonDays = 1,
  forecastMin = 10,
  forecastMax = 20,
  actualMin = 12,
  actualMax = 19,
  forecastType = 'cloud',
  actualType = 'cloud',
  period = 'AM'
} = {}) {
  const issueDate = issuedAt.slice(0, 10);
  const targetDate = addDays(issueDate, horizonDays);

  return {
    id: `${issueDate}-${issueBucket}-h${horizonDays}-${period}-${forecastType}-${actualType}`,
    issuedAt,
    issueDate,
    issueBucket,
    targetDate,
    horizonDays,
    forecast: {
      minC: forecastMin,
      maxC: forecastMax,
      periods: {
        AM: { type: period === 'AM' ? forecastType : 'cloud', label: 'Clouds', wet: false },
        PM: { type: period === 'PM' ? forecastType : 'cloud', label: 'Clouds', wet: false }
      }
    },
    actual: {
      resolvedAt: '2026-05-10T00:00:00.000Z',
      minC: actualMin,
      maxC: actualMax,
      periods: {
        AM: { type: period === 'AM' ? actualType : 'cloud', label: 'Clouds', wet: false },
        PM: { type: period === 'PM' ? actualType : 'cloud', label: 'Clouds', wet: false }
      }
    }
  };
}

function historyWithSnapshots(snapshots) {
  const history = normalizeHistory(null, LOCATION);
  history.locations[locationKey(LOCATION)].snapshots = snapshots;
  return history;
}

test('captures one morning snapshot set per local day for displayed horizons', () => {
  const weather = buildForecast('2026-05-29');
  const firstRun = new Date('2026-05-29T04:05:00Z');
  const history = captureForecastSnapshots(normalizeHistory(null, LOCATION), weather, firstRun, { location: LOCATION });
  const snapshots = history.locations[locationKey(LOCATION)].snapshots;

  assert.equal(snapshots.length, 5);
  assert.deepEqual(snapshots.map((snapshot) => snapshot.horizonDays), [1, 2, 3, 4, 5]);
  assert.ok(snapshots.every((snapshot) => snapshot.issueBucket === 'morning'));

  const afterDuplicateRun = captureForecastSnapshots(history, weather, new Date('2026-05-29T08:00:00Z'), { location: LOCATION });
  assert.equal(afterDuplicateRun.locations[locationKey(LOCATION)].snapshots.length, 5);
});

test('does not capture new snapshots before the morning threshold', () => {
  const history = captureForecastSnapshots(
    normalizeHistory(null, LOCATION),
    buildForecast('2026-05-29'),
    new Date('2026-05-29T02:30:00Z'),
    { location: LOCATION }
  );

  assert.equal(history.locations[locationKey(LOCATION)].snapshots.length, 0);
});

test('resolves newly completed target dates with hourly actual min max and wet periods', () => {
  const captured = captureForecastSnapshots(
    normalizeHistory(null, LOCATION),
    buildForecast('2026-05-29'),
    new Date('2026-05-29T04:05:00Z'),
    { location: LOCATION }
  );
  const ready = getReadyTargetDates(captured, new Date('2026-05-31T04:00:00Z'), { location: LOCATION });

  assert.deepEqual(ready, ['2026-05-30']);

  const hourly = buildHourly('2026-05-30', 1, 61, 0, 0);
  hourly.temperature_2m = Array.from({ length: 24 }, (_value, hour) => (hour < 12 ? 10 + hour : 33 - hour));
  hourly.precipitation = hourly.precipitation.map((_value, index) => (index < 6 ? 0.1 : 0));
  const actual = deriveActualDay({ hourly }, '2026-05-30');
  const resolved = resolveSnapshotsWithActuals(captured, { '2026-05-30': actual }, new Date('2026-05-31T04:00:00Z'), { location: LOCATION });
  const firstSnapshot = resolved.locations[locationKey(LOCATION)].snapshots[0];

  assert.equal(firstSnapshot.actual.minC, 10);
  assert.equal(firstSnapshot.actual.maxC, 21);
  assert.equal(firstSnapshot.actual.periods.AM.type, 'rain');
  assert.equal(firstSnapshot.actual.periods.PM.type, 'cloud');
});

test('trims raw history older than the retention window', () => {
  const oldSnapshot = resolvedSnapshot({ issuedAt: '2026-01-01T04:00:00.000Z' });
  const keptSnapshot = resolvedSnapshot({ issuedAt: '2026-05-01T04:00:00.000Z' });
  const trimmed = trimHistory(historyWithSnapshots([oldSnapshot, keptSnapshot]), new Date('2026-05-29T12:00:00Z'), { location: LOCATION });

  assert.deepEqual(
    trimmed.locations[locationKey(LOCATION)].snapshots.map((snapshot) => snapshot.issuedAt),
    [keptSnapshot.issuedAt]
  );
});

test('builds gated recency weighted temperature corrections with clamps and metrics', () => {
  const snapshots = Array.from({ length: 14 }, (_value, index) => resolvedSnapshot({
    issuedAt: `2026-05-${String(index + 1).padStart(2, '0')}T04:00:00.000Z`,
    forecastMin: 10,
    actualMin: 12,
    forecastMax: 20,
    actualMax: 19
  }));
  const model = buildBiasModel(historyWithSnapshots(snapshots), new Date('2026-05-29T08:00:00Z'), { location: LOCATION });

  assert.equal(model.adjustments['1'].minC.applied, true);
  assert.equal(model.adjustments['1'].minC.samples, 14);
  assert.equal(model.adjustments['1'].minC.delta, 1.5);
  assert.equal(model.adjustments['1'].maxC.delta, -1);
  assert.ok(model.metrics.temperature.horizons['1'].minC.correctedMae < model.metrics.temperature.horizons['1'].minC.rawMae);
});

test('allows stronger temperature clamps after enough evidence', () => {
  const snapshots = Array.from({ length: 42 }, (_value, index) => resolvedSnapshot({
    issuedAt: `2026-04-${String((index % 28) + 1).padStart(2, '0')}T04:00:00.000Z`,
    horizonDays: 2,
    forecastMin: 10,
    actualMin: 14,
    forecastMax: 20,
    actualMax: 20
  }));
  const model = buildBiasModel(historyWithSnapshots(snapshots), new Date('2026-05-29T08:00:00Z'), { location: LOCATION });

  assert.equal(model.adjustments['2'].minC.delta, 3);
});

test('uses icon evidence only when accuracy improves or wet false positives are strong', () => {
  const normalTooSmall = Array.from({ length: 19 }, (_value, index) => resolvedSnapshot({
    issuedAt: `2026-05-${String(index + 1).padStart(2, '0')}T04:00:00.000Z`,
    forecastType: 'cloud',
    actualType: 'sun'
  }));
  const withoutEnoughIconEvidence = buildBiasModel(historyWithSnapshots(normalTooSmall), new Date('2026-05-29T08:00:00Z'), { location: LOCATION });
  assert.deepEqual(withoutEnoughIconEvidence.adjustments['1'].periods.AM.overrides, {});

  const wetFalsePositives = Array.from({ length: 10 }, (_value, index) => resolvedSnapshot({
    issuedAt: `2026-05-${String(index + 1).padStart(2, '0')}T04:00:00.000Z`,
    forecastType: 'rain',
    actualType: 'cloud'
  }));
  const withWetSuppression = buildBiasModel(historyWithSnapshots(wetFalsePositives), new Date('2026-05-29T08:00:00Z'), { location: LOCATION });
  assert.equal(withWetSuppression.adjustments['1'].periods.AM.overrides.rain, 'cloud');

  const normalEnough = Array.from({ length: 20 }, (_value, index) => resolvedSnapshot({
    issuedAt: `2026-05-${String(index + 1).padStart(2, '0')}T04:00:00.000Z`,
    forecastType: 'cloud',
    actualType: 'sun'
  }));
  const withEnoughIconEvidence = buildBiasModel(historyWithSnapshots(normalEnough), new Date('2026-05-29T08:00:00Z'), { location: LOCATION });
  assert.equal(withEnoughIconEvidence.adjustments['1'].periods.AM.overrides.cloud, 'sun');
});

test('applies bias without inverting daily temperature range and guards implausible snow', () => {
  const corrected = applyForecastBias({
    horizonDays: 1,
    minC: 10,
    maxC: 11,
    periods: {
      AM: { type: 'cloud', label: 'Clouds' },
      PM: { type: 'cloud', label: 'Clouds' }
    }
  }, {
    adjustments: {
      1: {
        minC: { applied: true, delta: 5 },
        maxC: { applied: true, delta: -5 },
        periods: {
          AM: { overrides: { cloud: 'snow' } },
          PM: { overrides: {} }
        }
      }
    }
  });

  assert.ok(corrected.minC <= corrected.maxC);
  assert.equal(corrected.periods.AM.type, 'cloud');
});

test('rejects stale or mismatched runtime bias models', () => {
  const fresh = {
    schemaVersion: 1,
    generated_at: '2026-05-29T08:00:00.000Z',
    maxAgeHours: 36,
    location: LOCATION,
    adjustments: {}
  };

  assert.equal(isUsableBiasModel(fresh, LOCATION, new Date('2026-05-29T20:00:00Z')), true);
  assert.equal(isUsableBiasModel({ ...fresh, generated_at: '2026-05-27T08:00:00.000Z' }, LOCATION, new Date('2026-05-29T20:00:00Z')), false);
  assert.equal(isUsableBiasModel({ ...fresh, location: { ...LOCATION, latitude: 40 } }, LOCATION, new Date('2026-05-29T20:00:00Z')), false);
});

test('weather update runner writes weather, history, and bias files with injected dependencies', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pok-weather-update-'));

  try {
    const forecast = buildForecast('2026-05-29');
    const fetchImpl = async (url) => ({
      ok: true,
      status: 200,
      json: async () => {
        assert.match(String(url), /api\.open-meteo\.com\/v1\/forecast/);
        return structuredClone(forecast);
      }
    });

    await runWeatherUpdate({
      outputDir: dir,
      fetchImpl,
      now: new Date('2026-05-29T04:05:00Z'),
      log: () => {}
    });

    const weather = JSON.parse(await readFile(path.join(dir, 'weather.json'), 'utf8'));
    const history = JSON.parse(await readFile(path.join(dir, 'weather-bias-history.json'), 'utf8'));
    const bias = JSON.parse(await readFile(path.join(dir, 'weather-bias.json'), 'utf8'));

    assert.equal(weather.daily.time[0], '2026-05-29');
    assert.equal(weather.generated_at, '2026-05-29T04:05:00.000Z');
    assert.equal(history.locations[locationKey(LOCATION)].snapshots.length, 5);
    assert.equal(bias.generated_at, '2026-05-29T04:05:00.000Z');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
