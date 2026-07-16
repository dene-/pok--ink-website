#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  DEFAULT_LOCATION,
  buildBiasModel,
  captureForecastSnapshots,
  deriveActualDay,
  getReadyTargetDates,
  normalizeHistory,
  resolveSnapshotsWithActuals,
  trimHistory
} from './weather-bias-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const CONFIG = {
  ...DEFAULT_LOCATION,
  forecastDays: 6,
  outputDir: REPO_ROOT
};

export function buildWeatherUrl(config = CONFIG) {
  const params = new URLSearchParams({
    latitude: String(config.latitude),
    longitude: String(config.longitude),
    timezone: config.timezone,
    forecast_days: String(config.forecastDays || 6),
    timeformat: 'iso8601',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day',
    hourly: 'weather_code,cloud_cover,precipitation_probability,precipitation,rain,showers,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max'
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

export function buildOpenWeatherUrl(config = CONFIG, apiKey = '') {
  const params = new URLSearchParams({
    lat: String(config.latitude),
    lon: String(config.longitude),
    appid: String(apiKey),
    units: 'metric'
  });

  return `https://api.openweathermap.org/data/2.5/weather?${params.toString()}`;
}

export function buildArchiveUrl(isoDate, config = CONFIG) {
  const params = new URLSearchParams({
    latitude: String(config.latitude),
    longitude: String(config.longitude),
    timezone: config.timezone,
    start_date: isoDate,
    end_date: isoDate,
    timeformat: 'iso8601',
    temperature_unit: 'celsius',
    precipitation_unit: 'mm',
    hourly: 'temperature_2m,weather_code,precipitation,rain,showers'
  });

  return `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`;
}

export function validateWeatherData(data) {
  if (!data || typeof data !== 'object') throw new Error('empty weather payload');
  if (!data.current || typeof data.current !== 'object') throw new Error('missing current weather');
  if (!data.daily || typeof data.daily !== 'object') throw new Error('missing daily weather');
  if (!Array.isArray(data.daily.time) || data.daily.time.length < 6) {
    throw new Error('missing forecast dates');
  }
  if (!data.hourly || typeof data.hourly !== 'object') throw new Error('missing hourly weather');
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function fetchJson(fetchImpl, url, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 1);
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 0);
  const requestLabel = options.requestLabel || url;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${requestLabel} HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts && retryDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }

  throw lastError;
}

function localDateTimeFromUnixSeconds(value, timezone) {
  const date = new Date(Number(value) * 1000);
  if (!Number.isFinite(date.getTime())) throw new Error('OpenWeather returned an invalid observation time');

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function applyOpenWeatherCurrent(weather, current, config) {
  const temperature = Number(current?.main?.temp);
  if (!Number.isFinite(temperature)) throw new Error('OpenWeather returned no current temperature');

  weather.current.temperature_2m = temperature;
  weather.current.time = localDateTimeFromUnixSeconds(current.dt, config.timezone);

  const temperatureMin = Number(current?.main?.temp_min);
  if (Number.isFinite(temperatureMin)) weather.current.temperature_min = temperatureMin;

  const temperatureMax = Number(current?.main?.temp_max);
  if (Number.isFinite(temperatureMax)) weather.current.temperature_max = temperatureMax;

  const apparentTemperature = Number(current?.main?.feels_like);
  if (Number.isFinite(apparentTemperature)) weather.current.apparent_temperature = apparentTemperature;

  const humidity = Number(current?.main?.humidity);
  if (Number.isFinite(humidity)) weather.current.relative_humidity_2m = humidity;

  const windSpeedMs = Number(current?.wind?.speed);
  if (Number.isFinite(windSpeedMs)) weather.current.wind_speed_10m = windSpeedMs * 3.6;

  const windGustMs = Number(current?.wind?.gust);
  if (Number.isFinite(windGustMs)) weather.current.wind_gust_10m = windGustMs * 3.6;

  const windDirection = Number(current?.wind?.deg);
  if (Number.isFinite(windDirection)) weather.current.wind_direction_10m = windDirection;

  const description = current?.weather?.[0]?.description;
  if (typeof description === 'string' && description.trim()) {
    weather.current.description = description.trim();
  }

  const observationDate = new Date(Number(current.dt) * 1000);
  const sunrise = Number(current?.sys?.sunrise) * 1000;
  const sunset = Number(current?.sys?.sunset) * 1000;
  weather.current.is_day = Number.isFinite(sunrise) && Number.isFinite(sunset)
    ? (observationDate.getTime() >= sunrise && observationDate.getTime() < sunset ? 1 : 0)
    : weather.current.is_day;
  weather.current_source = 'openweather';
}

function resolveConfig(options = {}) {
  const outputDir = options.outputDir
    || process.env.WEATHER_OUTPUT_DIR
    || CONFIG.outputDir;
  const historyPath = options.historyPath
    || process.env.WEATHER_HISTORY_PATH
    || path.join(outputDir, 'weather-bias-history.json');
  const location = {
    latitude: Number(options.latitude ?? process.env.WEATHER_LATITUDE ?? CONFIG.latitude),
    longitude: Number(options.longitude ?? process.env.WEATHER_LONGITUDE ?? CONFIG.longitude),
    timezone: String(options.timezone ?? process.env.WEATHER_TIMEZONE ?? CONFIG.timezone)
  };

  return {
    ...CONFIG,
    ...location,
    location,
    outputDir,
    historyPath,
    forecastDays: Number(options.forecastDays || CONFIG.forecastDays)
  };
}

export async function runWeatherUpdate(options = {}) {
  const now = options.now || new Date();
  const fetchImpl = options.fetchImpl || fetch;
  const log = options.log || console.log;
  const config = resolveConfig(options);
  const forecastUrl = buildWeatherUrl(config);
  const weather = await fetchJson(fetchImpl, forecastUrl, {
    attempts: Number(options.fetchAttempts) || 3,
    retryDelayMs: options.fetchRetryDelayMs ?? 1000,
    requestLabel: 'Open-Meteo forecast'
  });

  validateWeatherData(weather);
  weather.generated_at = now.toISOString();
  weather.source_url = forecastUrl;

  const openWeatherApiKey = String(options.openWeatherApiKey ?? process.env.OPENWEATHER_API_KEY ?? '').trim();
  const requireOpenWeather = options.requireOpenWeather
    ?? ['1', 'true', 'yes', 'on'].includes(String(process.env.REQUIRE_OPENWEATHER_API_KEY || '').trim().toLowerCase());

  if (requireOpenWeather && !openWeatherApiKey) {
    throw new Error('OPENWEATHER_API_KEY is required for current weather');
  }

  if (openWeatherApiKey) {
    try {
      const openWeatherUrl = buildOpenWeatherUrl(config, openWeatherApiKey);
      const current = await fetchJson(fetchImpl, openWeatherUrl, {
        attempts: Number(options.currentFetchAttempts) || 2,
        retryDelayMs: options.currentFetchRetryDelayMs ?? 1000,
        requestLabel: 'OpenWeather current weather'
      });
      applyOpenWeatherCurrent(weather, current, config);
    } catch (error) {
      if (requireOpenWeather) {
        throw new Error(`OpenWeather current weather required: ${error.message}`);
      }
      log(`OpenWeather current weather unavailable; using Open-Meteo current: ${error.message}`);
    }
  }

  await mkdir(config.outputDir, { recursive: true });

  let history = normalizeHistory(await readJsonIfExists(config.historyPath), config.location);
  history = captureForecastSnapshots(history, weather, now, { location: config.location });

  const actualsByDate = {};
  for (const isoDate of getReadyTargetDates(history, now, { location: config.location })) {
    try {
      const archiveUrl = buildArchiveUrl(isoDate, config);
      const actualData = await fetchJson(fetchImpl, archiveUrl);
      actualsByDate[isoDate] = deriveActualDay(actualData, isoDate);
    } catch (error) {
      log(`Skipped actual resolution for ${isoDate}: ${error.message}`);
    }
  }

  history = resolveSnapshotsWithActuals(history, actualsByDate, now, { location: config.location });
  history = trimHistory(history, now, { location: config.location });
  const bias = buildBiasModel(history, now, { location: config.location });

  const weatherPath = path.join(config.outputDir, 'weather.json');
  const historyOutputPath = path.join(config.outputDir, 'weather-bias-history.json');
  const biasPath = path.join(config.outputDir, 'weather-bias.json');

  await writeFile(weatherPath, `${JSON.stringify(weather, null, 2)}\n`);
  await writeFile(historyOutputPath, `${JSON.stringify(history, null, 2)}\n`);
  await writeFile(biasPath, `${JSON.stringify(bias, null, 2)}\n`);

  log(`Wrote ${weatherPath}`);
  log(`Wrote ${historyOutputPath}`);
  log(`Wrote ${biasPath}`);

  return { weather, history, bias };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWeatherUpdate().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
