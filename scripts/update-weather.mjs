#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';

const CONFIG = {
  latitude: 41.3474,
  longitude: 2.0431,
  timezone: 'Europe/Madrid',
  outputPath: new URL('../weather.json', import.meta.url)
};

function buildWeatherUrl() {
  const params = new URLSearchParams({
    latitude: String(CONFIG.latitude),
    longitude: String(CONFIG.longitude),
    timezone: CONFIG.timezone,
    forecast_days: '6',
    timeformat: 'iso8601',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day',
    hourly: 'weather_code,cloud_cover,precipitation_probability,precipitation,rain,showers,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max'
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function validateWeatherData(data) {
  if (!data || typeof data !== 'object') throw new Error('empty weather payload');
  if (!data.current || typeof data.current !== 'object') throw new Error('missing current weather');
  if (!data.daily || typeof data.daily !== 'object') throw new Error('missing daily weather');
  if (!Array.isArray(data.daily.time) || data.daily.time.length < 6) {
    throw new Error('missing forecast dates');
  }
}

const sourceUrl = buildWeatherUrl();
const response = await fetch(sourceUrl, { cache: 'no-store' });
if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);

const weather = await response.json();
validateWeatherData(weather);
weather.generated_at = new Date().toISOString();
weather.source_url = sourceUrl;

await writeFile(CONFIG.outputPath, `${JSON.stringify(weather, null, 2)}\n`);
console.log(`Wrote ${CONFIG.outputPath.pathname}`);
