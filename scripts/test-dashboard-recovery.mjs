import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const html = await readFile(new URL('../dashboard.html', import.meta.url), 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/\s+await init\(\);\s*$/, '');
function context() {
  const ctx = vm.createContext({ console, Intl, URLSearchParams, window: {}, document: { getElementById: () => null } });
  vm.runInContext(script, ctx);
  return ctx;
}

test('emergency observation age is independent of the browser timezone', () => {
  const ctx = context();
  assert.equal(vm.runInContext(`weatherDataTimestamp({ current: { time: '2026-09-06T16:00' }, utc_offset_seconds: 7200 })`, ctx), Date.parse('2026-09-06T14:00Z'));
});

test('invalid sensor values and expired snapshots are unavailable', () => {
  const ctx = context();
  for (const battery of ['null', "''", 'false']) {
    assert.throws(() => vm.runInContext(`parseSensorData({ generated_at: new Date().toISOString(), battery: ${battery}, insideTemp: 25, insideHumidity: 40 })`, ctx), /missing sensor/);
  }
  assert.throws(() => vm.runInContext(`parseSensorData({ generated_at: '2020-01-01T00:00Z', battery: 50, insideTemp: 25, insideHumidity: 40 })`, ctx), /stale sensor/);
});

test('newer local publication replaces fresh cache when generated branch is unreachable', async () => {
  const ctx = context();
  await vm.runInContext(`
    globalThis.applied = null;
    fetchGeneratedWeather = async () => { throw new Error('offline'); };
    fetchWeatherBias = async () => null;
    applyCachedWeather = () => {
      weatherHasData = true;
      activeWeatherData = { generated_at: new Date(Date.now() - 30 * 60000).toISOString() };
      weatherSource = 'cache';
      return true;
    };
    fetchLocalWeather = async () => {
      weatherSource = 'local';
      return { generated_at: new Date().toISOString(), marker: 'new publication' };
    };
    applyWeatherData = (data) => { globalThis.applied = data.marker; };
    updateWeather();
  `, ctx);
  assert.equal(ctx.applied, 'new publication');
});

test('initial bootstrap also considers a newer cached publication', async () => {
  const ctx = context();
  await vm.runInContext(`
    globalThis.cacheChecked = false;
    applyEmbeddedWeather = () => true;
    applyCachedWeather = () => { globalThis.cacheChecked = true; return true; };
    applyInitialWeatherFallback();
  `, ctx);
  assert.equal(ctx.cacheChecked, true);
});

test('future publications are rejected', () => {
  const ctx = context();
  assert.throws(() => vm.runInContext(`validateGeneratedWeatherData({ current: {}, daily: { time: Array(6).fill('2026-09-06') }, generated_at: '2099-01-01T00:00Z' })`, ctx), /future/);
});

test('current icons use the observed condition instead of a conflicting forecast', () => {
  const ctx = context();
  for (const [code, icon] of [[200, 'storm'], [300, 'rain'], [500, 'rain'], [600, 'snow'], [741, 'fog'], [800, 'sun'], [804, 'cloud']]) {
    assert.equal(vm.runInContext(`currentWeatherIconType({ openweather_condition_id: ${code}, weather_code: 0 })`, ctx), icon);
  }
});

test('today min/max use daily forecasts rather than nearby current observations', () => {
  const ctx = context();
  vm.runInContext(`
    globalThis.values = {};
    setText = (id, value) => { globalThis.values[id] = value; };
    setHTML = () => {};
    updateForecastDay = () => {};
    applyWeatherData({ current: { temperature_2m: 30, temperature_min: 29, temperature_max: 32 },
      daily: { time: Array(6).fill('2026-09-06'), temperature_2m_min: [21], temperature_2m_max: [35] } });
  `, ctx);
  assert.equal(ctx.values.todayMin, '21.0');
  assert.equal(ctx.values.todayMax, '35.0');
});

test('a published snapshot renders without startup API requests that can stall capture', async () => {
  const ctx = context();
  ctx.document.getElementById = (id) => id === 'photoImage'
    ? { addEventListener() {}, src: '' }
    : id === 'sensorBootstrap' ? { textContent: 'null' } : null;
  ctx.window.setInterval = () => {};
  await vm.runInContext(`
    globalThis.requests = 0;
    applyUrlConfig = () => {};
    applyInitialWeatherFallback = async () => {
      weatherHasData = true;
      activeWeatherData = { generated_at: new Date().toISOString() };
    };
    updateWeather = async () => { globalThis.requests += 1; };
    updateDevice = async () => { globalThis.requests += 1; };
    globalThis.awaitInit = init();
  `, ctx);
  await ctx.awaitInit;
  assert.equal(ctx.requests, 0);
  assert.equal(ctx.window.__E1002_READY__, true);
});
