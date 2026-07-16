export const SCHEMA_VERSION = 2;

export const DEFAULT_LOCATION = {
  latitude: 41.3474,
  longitude: 2.0431,
  timezone: 'Europe/Madrid'
};

export const DEFAULT_LIMITS = {
  biasMaxAgeHours: 36,
  historyRetentionDays: 120,
  temperatureMinSamples: 14,
  temperatureFullClampSamples: 42,
  temperatureMinClampC: 1.5,
  temperatureMaxClampC: 3,
  recencyHalfLifeDays: 45,
  iconMinSamples: 20,
  wetFalsePositiveMinSamples: 10,
  wetFalsePositiveDryShare: 0.7,
  validationFraction: 0.25,
  validationMinSamples: 4,
  minimumImprovementC: 0.1,
  actualWetTotalMm: 0.5,
  actualWetHourlyMm: 0.2,
  forecastWetTotalMm: 0.5,
  forecastWetProbability: 35
};

const PERIOD_LABELS = ['AM', 'PM'];
const FORECAST_HORIZONS = [1, 2, 3, 4, 5];
const ICON_TYPES = ['sun', 'cloud', 'fog', 'showers', 'rain', 'snow', 'storm'];
const DRY_TYPES = new Set(['sun', 'cloud', 'fog']);
const WET_TYPES = new Set(['showers', 'rain', 'snow', 'storm']);
const WET_FALSE_POSITIVE_TYPES = new Set(['showers', 'rain', 'storm']);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function round(value, decimals = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function numberAt(array, index) {
  if (!Array.isArray(array)) return null;
  const n = Number(array[index]);
  return Number.isFinite(n) ? n : null;
}

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

function isoDateToNoon(isoDate) {
  return new Date(`${String(isoDate).slice(0, 10)}T12:00:00Z`);
}

function addDays(isoDate, days) {
  const date = isoDateToNoon(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromIsoDate, toDate) {
  const from = isoDateToNoon(fromIsoDate).getTime();
  return Math.max(0, (toDate.getTime() - from) / 86400000);
}

function mergeOptions(options = {}) {
  return {
    location: options.location || DEFAULT_LOCATION,
    limits: { ...DEFAULT_LIMITS, ...(options.limits || {}) }
  };
}

export function forecastProvenance(weather = {}) {
  const sourceUrl = String(weather.source_url || '');
  const source = String(weather.forecast_source || '').trim()
    || (sourceUrl.includes('open-meteo') || !sourceUrl ? 'open-meteo' : 'unknown');
  const model = String(weather.forecast_model || '').trim()
    || (source === 'open-meteo' ? 'open-meteo-best-match' : 'unknown');
  return { source, model };
}

function snapshotProvenance(snapshot = {}) {
  return {
    source: String(snapshot.forecastSource || '').trim() || 'open-meteo',
    model: String(snapshot.forecastModel || '').trim() || 'open-meteo-best-match'
  };
}

export function locationKey(location = DEFAULT_LOCATION) {
  return [
    round(location.latitude, 4),
    round(location.longitude, 4),
    location.timezone || DEFAULT_LOCATION.timezone
  ].join('|');
}

function locationsMatch(actual, expected) {
  if (!actual || !expected) return false;
  const latOk = Math.abs(Number(actual.latitude) - Number(expected.latitude)) <= 0.01;
  const lonOk = Math.abs(Number(actual.longitude) - Number(expected.longitude)) <= 0.01;
  return latOk && lonOk && String(actual.timezone) === String(expected.timezone);
}

export function normalizeHistory(history, location = DEFAULT_LOCATION) {
  const key = locationKey(location);
  const normalized = history && typeof history === 'object'
    ? cloneJson(history)
    : { schemaVersion: SCHEMA_VERSION, locations: {} };

  normalized.schemaVersion = SCHEMA_VERSION;
  if (!normalized.locations || typeof normalized.locations !== 'object') {
    normalized.locations = {};
  }

  if (!normalized.locations[key]) {
    normalized.locations[key] = {
      location: cloneJson(location),
      snapshots: []
    };
  }

  if (!Array.isArray(normalized.locations[key].snapshots)) {
    normalized.locations[key].snapshots = [];
  }
  normalized.locations[key].location = cloneJson(location);

  return normalized;
}

function getStore(history, location) {
  const key = locationKey(location);
  return history.locations[key];
}

export function weatherPeriodType(code) {
  const c = Number(code);
  if (c === 0 || c === 1) return 'sun';
  if (c === 2 || c === 3) return 'cloud';
  if (c === 45 || c === 48) return 'fog';
  if ([51, 53, 55, 56, 57, 80, 81, 82].includes(c)) return 'showers';
  if ([61, 63, 65, 66, 67].includes(c)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(c)) return 'snow';
  if ([95, 96, 99].includes(c)) return 'storm';
  return 'cloud';
}

export function shortWeatherLabel(type) {
  const labels = {
    sun: 'Clear',
    cloud: 'Clouds',
    fog: 'Fog',
    rain: 'Rain',
    showers: 'Showers',
    storm: 'Storm',
    snow: 'Snow'
  };
  return labels[type] || 'Clouds';
}

export function periodHoursForLabel(label) {
  return label === 'AM' ? { start: 0, end: 11 } : { start: 12, end: 23 };
}

function periodEntries(hourly, isoDate, label) {
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const hours = periodHoursForLabel(label);

  return times.map((time, index) => {
    const hour = Number(String(time).slice(11, 13));
    return { time, index, hour };
  }).filter((entry) => (
    String(entry.time).slice(0, 10) === isoDate
    && Number.isFinite(entry.hour)
    && entry.hour >= hours.start
    && entry.hour <= hours.end
  ));
}

function winningType(counts, firstSeen, allowedTypes = null) {
  return firstSeen.reduce((winner, type) => {
    if (allowedTypes && !allowedTypes.has(type)) return winner;
    if (!winner) return type;
    return counts[type] > counts[winner] ? type : winner;
  }, '');
}

function dryFallbackType(counts, firstSeen, fallbackType) {
  const dryWinner = winningType(counts, firstSeen, DRY_TYPES);
  if (dryWinner) return dryWinner;
  return DRY_TYPES.has(fallbackType) ? fallbackType : 'cloud';
}

export function summarizeWeatherPeriod(data, isoDate, label, dailyCode, mode = 'forecast', limits = DEFAULT_LIMITS) {
  const fallbackType = weatherPeriodType(dailyCode);
  const hourly = data.hourly || data || {};
  const entries = periodEntries(hourly, isoDate, label);

  if (!entries.length) {
    return {
      type: fallbackType,
      label: shortWeatherLabel(fallbackType),
      wet: false,
      precipitationTotalMm: 0,
      maxPrecipitationProbability: 0
    };
  }

  const summary = entries.reduce((acc, entry) => {
    const type = weatherPeriodType(numberAt(hourly.weather_code, entry.index));
    const precipitation = numberAt(hourly.precipitation, entry.index)
      ?? ((numberAt(hourly.rain, entry.index) || 0) + (numberAt(hourly.showers, entry.index) || 0));
    const probability = numberAt(hourly.precipitation_probability, entry.index) || 0;

    acc.counts[type] = (acc.counts[type] || 0) + 1;
    if (!acc.firstSeen.includes(type)) acc.firstSeen.push(type);
    acc.precipitationTotalMm += precipitation || 0;
    acc.maxHourlyPrecipitationMm = Math.max(acc.maxHourlyPrecipitationMm, precipitation || 0);
    acc.maxPrecipitationProbability = Math.max(acc.maxPrecipitationProbability, probability);
    return acc;
  }, {
    counts: {},
    firstSeen: [],
    precipitationTotalMm: 0,
    maxHourlyPrecipitationMm: 0,
    maxPrecipitationProbability: 0
  });

  const rawType = winningType(summary.counts, summary.firstSeen) || fallbackType;
  const wet = mode === 'actual'
    ? summary.precipitationTotalMm >= limits.actualWetTotalMm
      || summary.maxHourlyPrecipitationMm >= limits.actualWetHourlyMm
    : summary.maxPrecipitationProbability >= limits.forecastWetProbability
      || summary.precipitationTotalMm >= limits.forecastWetTotalMm;
  const type = WET_TYPES.has(rawType) && !wet
    ? dryFallbackType(summary.counts, summary.firstSeen, fallbackType)
    : rawType;

  return {
    type,
    label: shortWeatherLabel(type),
    wet,
    precipitationTotalMm: round(summary.precipitationTotalMm, 2),
    maxPrecipitationProbability: round(summary.maxPrecipitationProbability, 1)
  };
}

export function deriveActualDay(data, isoDate, limits = DEFAULT_LIMITS) {
  const hourly = data.hourly || {};
  const entries = periodEntries(hourly, isoDate, 'AM').concat(periodEntries(hourly, isoDate, 'PM'));
  const temperatures = entries.map((entry) => numberAt(hourly.temperature_2m, entry.index))
    .filter((value) => Number.isFinite(value));

  if (!temperatures.length) {
    throw new Error(`missing actual hourly temperatures for ${isoDate}`);
  }

  return {
    minC: round(Math.min(...temperatures), 1),
    maxC: round(Math.max(...temperatures), 1),
    periods: {
      AM: summarizeWeatherPeriod({ hourly }, isoDate, 'AM', undefined, 'actual', limits),
      PM: summarizeWeatherPeriod({ hourly }, isoDate, 'PM', undefined, 'actual', limits)
    }
  };
}

function captureBucketForDate(date, timezone) {
  const parts = localParts(date, timezone);
  if (parts.hour < 6) return null;
  return parts.hour < 18 ? 'morning' : 'evening';
}

export function modelIssueBucketForDate(date, timezone = DEFAULT_LOCATION.timezone) {
  const parts = localParts(date, timezone);
  return parts.hour >= 6 && parts.hour < 18 ? 'morning' : 'evening';
}

export function captureForecastSnapshots(historyInput, weather, now = new Date(), options = {}) {
  const { location, limits } = mergeOptions(options);
  const history = normalizeHistory(historyInput, location);
  const store = getStore(history, location);
  const provenance = forecastProvenance(weather);
  const parts = localParts(now, location.timezone);
  const issueBucket = captureBucketForDate(now, location.timezone);

  if (!issueBucket) return history;

  const alreadyCaptured = store.snapshots.some((snapshot) => (
    snapshot.issueDate === parts.date && snapshot.issueBucket === issueBucket
  ));
  if (alreadyCaptured) return history;

  const daily = weather.daily || {};

  for (const horizonDays of FORECAST_HORIZONS) {
    const targetDate = Array.isArray(daily.time) ? daily.time[horizonDays] : '';
    if (!targetDate) continue;

    const dailyCode = numberAt(daily.weather_code, horizonDays);
    const forecast = {
      minC: round(numberAt(daily.temperature_2m_min, horizonDays), 1),
      maxC: round(numberAt(daily.temperature_2m_max, horizonDays), 1),
      periods: {
        AM: summarizeWeatherPeriod(weather, targetDate, 'AM', dailyCode, 'forecast', limits),
        PM: summarizeWeatherPeriod(weather, targetDate, 'PM', dailyCode, 'forecast', limits)
      }
    };

    store.snapshots.push({
      id: `${locationKey(location)}:${parts.date}:${issueBucket}:h${horizonDays}`,
      issuedAt: now.toISOString(),
      issueDate: parts.date,
      issueBucket,
      forecastSource: provenance.source,
      forecastModel: provenance.model,
      forecastIssuedAt: weather.generated_at || null,
      targetDate,
      horizonDays,
      forecast,
      actual: null
    });
  }

  history.updated_at = now.toISOString();
  return history;
}

export function getReadyTargetDates(historyInput, now = new Date(), options = {}) {
  const { location } = mergeOptions(options);
  const history = normalizeHistory(historyInput, location);
  const store = getStore(history, location);
  const today = localParts(now, location.timezone).date;
  const dates = new Set();

  for (const snapshot of store.snapshots) {
    if (!snapshot.actual && snapshot.targetDate && snapshot.targetDate < today) {
      dates.add(snapshot.targetDate);
    }
  }

  return Array.from(dates).sort();
}

export function resolveSnapshotsWithActuals(historyInput, actualsByDate, now = new Date(), options = {}) {
  const { location } = mergeOptions(options);
  const history = normalizeHistory(historyInput, location);
  const store = getStore(history, location);
  const resolvedAt = now.toISOString();

  store.snapshots = store.snapshots.map((snapshot) => {
    if (snapshot.actual || !actualsByDate[snapshot.targetDate]) return snapshot;
    return {
      ...snapshot,
      actual: {
        ...cloneJson(actualsByDate[snapshot.targetDate]),
        resolvedAt
      }
    };
  });

  history.updated_at = resolvedAt;
  return history;
}

export function trimHistory(historyInput, now = new Date(), options = {}) {
  const { location, limits } = mergeOptions(options);
  const history = normalizeHistory(historyInput, location);
  const cutoff = now.getTime() - limits.historyRetentionDays * 86400000;

  for (const store of Object.values(history.locations)) {
    if (!Array.isArray(store.snapshots)) continue;
    store.snapshots = store.snapshots.filter((snapshot) => {
      const issuedAt = new Date(snapshot.issuedAt).getTime();
      return Number.isFinite(issuedAt) && issuedAt >= cutoff;
    });
  }

  history.updated_at = now.toISOString();
  return history;
}

function resolvedSamples(history, location, forecastSource, forecastModel) {
  const store = getStore(history, location);
  return store.snapshots.filter((snapshot) => {
    if (!snapshot.actual) return false;
    const provenance = snapshotProvenance(snapshot);
    return provenance.source === forecastSource && provenance.model === forecastModel;
  });
}

function temperatureClamp(sampleCount, limits) {
  if (sampleCount <= limits.temperatureMinSamples) return limits.temperatureMinClampC;
  const progress = Math.min(
    1,
    (sampleCount - limits.temperatureMinSamples)
      / (limits.temperatureFullClampSamples - limits.temperatureMinSamples)
  );
  return limits.temperatureMinClampC
    + (limits.temperatureMaxClampC - limits.temperatureMinClampC) * progress;
}

function validationSplit(rows, limits) {
  const ordered = [...rows].sort((left, right) => {
    const leftTime = new Date(left.issuedAt).getTime();
    const rightTime = new Date(right.issuedAt).getTime();
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
  });
  const validationCount = Math.max(
    limits.validationMinSamples,
    Math.ceil(ordered.length * limits.validationFraction)
  );
  if (ordered.length <= validationCount) return { training: [], validation: ordered };
  return {
    training: ordered.slice(0, ordered.length - validationCount),
    validation: ordered.slice(ordered.length - validationCount)
  };
}

function weightedMedian(rows, now, limits, field) {
  const weighted = rows.map((snapshot) => {
    const error = Number(snapshot.actual[field]) - Number(snapshot.forecast[field]);
    const ageDays = daysBetween(snapshot.targetDate, now);
    return {
      error,
      weight: 0.5 ** (ageDays / limits.recencyHalfLifeDays)
    };
  }).filter((item) => Number.isFinite(item.error) && Number.isFinite(item.weight) && item.weight > 0)
    .sort((left, right) => left.error - right.error);

  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;

  let accumulated = 0;
  for (const item of weighted) {
    accumulated += item.weight;
    if (accumulated >= totalWeight / 2) return item.error;
  }
  return weighted[weighted.length - 1].error;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeTemperatureAdjustment(samples, horizonDays, issueBucket, field, now, limits) {
  const horizonSamples = samples.filter((snapshot) => (
    snapshot.horizonDays === horizonDays
    && Number.isFinite(Number(snapshot.forecast?.[field]))
    && Number.isFinite(Number(snapshot.actual?.[field]))
  ));
  const matching = horizonSamples.filter((snapshot) => snapshot.issueBucket === issueBucket);
  const selected = matching.length >= limits.temperatureMinSamples
    ? matching
    : horizonSamples.length >= limits.temperatureMinSamples
      ? horizonSamples
      : [];
  const source = matching.length >= limits.temperatureMinSamples ? 'matching_bucket' : 'combined_bucket';

  if (!selected.length) {
    return {
      applied: false,
      delta: 0,
      samples: horizonSamples.length,
      rawMae: null,
      correctedMae: null,
      reason: 'not_enough_samples'
    };
  }

  const { training, validation } = validationSplit(selected, limits);
  if (!training.length || validation.length < limits.validationMinSamples) {
    return {
      applied: false,
      delta: 0,
      samples: selected.length,
      trainingSamples: training.length,
      validationSamples: validation.length,
      rawMae: null,
      correctedMae: null,
      reason: 'not_enough_validation_samples'
    };
  }

  const unclampedDelta = weightedMedian(training, now, limits, field);
  const clamp = temperatureClamp(selected.length, limits);
  const delta = round(Math.max(-clamp, Math.min(clamp, unclampedDelta)), 1);
  const validationErrors = validation.map((snapshot) => Number(snapshot.actual[field]) - Number(snapshot.forecast[field]))
    .filter((error) => Number.isFinite(error));
  const rawMae = mean(validationErrors.map((error) => Math.abs(error)));
  const correctedMae = mean(validationErrors.map((error) => Math.abs(error - delta)));
  const improvement = rawMae !== null && correctedMae !== null ? rawMae - correctedMae : null;
  const improves = improvement !== null && improvement >= limits.minimumImprovementC;

  return {
    applied: improves && Math.abs(delta) >= 0.1,
    delta,
    samples: selected.length,
    trainingSamples: training.length,
    validationSamples: validationErrors.length,
    rawMae: round(rawMae, 3),
    correctedMae: round(correctedMae, 3),
    improvementC: round(improvement, 3),
    reason: improves ? `${source}_validated` : 'no_validated_improvement'
  };
}

function dominantActualType(rows) {
  const counts = {};
  const firstSeen = [];
  for (const row of rows) {
    const type = row.actualType || 'cloud';
    counts[type] = (counts[type] || 0) + 1;
    if (!firstSeen.includes(type)) firstSeen.push(type);
  }
  return winningType(counts, firstSeen) || 'cloud';
}

function iconRows(samples, horizonDays, issueBucket, period, forecastType, limits) {
  const horizonRows = samples.filter((snapshot) => (
    snapshot.horizonDays === horizonDays
    && snapshot.forecast?.periods?.[period]?.type === forecastType
    && snapshot.actual?.periods?.[period]?.type
  )).map((snapshot) => ({
    forecastType,
    actualType: snapshot.actual.periods[period].type,
    issueBucket: snapshot.issueBucket,
    issuedAt: snapshot.issuedAt
  }));

  const matching = horizonRows.filter((row) => row.issueBucket === issueBucket);
  const minNeeded = WET_FALSE_POSITIVE_TYPES.has(forecastType)
    ? limits.wetFalsePositiveMinSamples
    : limits.iconMinSamples;

  if (matching.length >= minNeeded) {
    return { rows: matching, source: 'matching_bucket' };
  }
  return { rows: horizonRows, source: 'combined_bucket' };
}

function computeIconAdjustment(samples, horizonDays, issueBucket, period, limits) {
  const overrides = {};
  const reasons = {};

  for (const forecastType of ICON_TYPES) {
    const { rows, source } = iconRows(samples, horizonDays, issueBucket, period, forecastType, limits);
    if (!rows.length) continue;

    const { training, validation } = validationSplit(rows, limits);
    const candidate = dominantActualType(training);
    const rawCorrect = validation.filter((row) => row.actualType === forecastType).length;
    const correctedCorrect = validation.filter((row) => row.actualType === candidate).length;
    const dryActualCount = rows.filter((row) => DRY_TYPES.has(row.actualType)).length;
    const strongWetFalsePositive = WET_FALSE_POSITIVE_TYPES.has(forecastType)
      && rows.length >= limits.wetFalsePositiveMinSamples
      && dryActualCount / rows.length >= limits.wetFalsePositiveDryShare;
    const normalEligible = rows.length >= limits.iconMinSamples;

    if (
      candidate !== forecastType
      && validation.length >= limits.validationMinSamples
      && correctedCorrect > rawCorrect
      && (normalEligible || strongWetFalsePositive)
    ) {
      overrides[forecastType] = candidate;
      reasons[forecastType] = strongWetFalsePositive ? `wet_false_positive_${source}` : source;
    }
  }

  const metricRows = samples.filter((snapshot) => (
    snapshot.horizonDays === horizonDays
    && snapshot.actual?.periods?.[period]?.type
    && snapshot.forecast?.periods?.[period]?.type
  ));
  const metricValidation = validationSplit(metricRows, limits).validation;
  const rawCorrect = metricValidation.filter((snapshot) => (
    snapshot.actual.periods[period].type === snapshot.forecast.periods[period].type
  )).length;
  const correctedCorrect = metricValidation.filter((snapshot) => {
    const forecastType = snapshot.forecast.periods[period].type;
    const correctedType = overrides[forecastType] || forecastType;
    return snapshot.actual.periods[period].type === correctedType;
  }).length;
  const wetForecastRows = metricValidation.filter((snapshot) => WET_FALSE_POSITIVE_TYPES.has(snapshot.forecast.periods[period].type));
  const wetFalsePositiveRows = wetForecastRows.filter((snapshot) => DRY_TYPES.has(snapshot.actual.periods[period].type));

  return {
    overrides,
    samples: metricRows.length,
    validationSamples: metricValidation.length,
    rawAccuracy: metricValidation.length ? round(rawCorrect / metricValidation.length, 3) : null,
    correctedAccuracy: metricValidation.length ? round(correctedCorrect / metricValidation.length, 3) : null,
    wetFalsePositiveRate: wetForecastRows.length ? round(wetFalsePositiveRows.length / wetForecastRows.length, 3) : null,
    reasons
  };
}

export function buildBiasModel(historyInput, now = new Date(), options = {}) {
  const { location, limits } = mergeOptions(options);
  const history = normalizeHistory(historyInput, location);
  const forecastSource = String(options.forecastSource || 'open-meteo').trim() || 'open-meteo';
  const forecastModel = String(options.forecastModel || (forecastSource === 'open-meteo' ? 'open-meteo-best-match' : 'unknown')).trim() || 'unknown';
  const samples = resolvedSamples(history, location, forecastSource, forecastModel);
  const issueBucket = modelIssueBucketForDate(now, location.timezone);
  const adjustments = {};
  const temperatureMetrics = { horizons: {} };
  const iconMetrics = { horizons: {} };

  for (const horizonDays of FORECAST_HORIZONS) {
    const minC = computeTemperatureAdjustment(samples, horizonDays, issueBucket, 'minC', now, limits);
    const maxC = computeTemperatureAdjustment(samples, horizonDays, issueBucket, 'maxC', now, limits);
    const periods = {};

    iconMetrics.horizons[horizonDays] = {};
    for (const period of PERIOD_LABELS) {
      periods[period] = computeIconAdjustment(samples, horizonDays, issueBucket, period, limits);
      iconMetrics.horizons[horizonDays][period] = {
        samples: periods[period].samples,
        validationSamples: periods[period].validationSamples,
        rawAccuracy: periods[period].rawAccuracy,
        correctedAccuracy: periods[period].correctedAccuracy,
        wetFalsePositiveRate: periods[period].wetFalsePositiveRate,
        overrides: cloneJson(periods[period].overrides),
        reasons: cloneJson(periods[period].reasons)
      };
    }

    adjustments[horizonDays] = { minC, maxC, periods };
    temperatureMetrics.horizons[horizonDays] = { minC, maxC };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    modelType: 'rolling-holdout',
    generated_at: now.toISOString(),
    location: cloneJson(location),
    forecastSource,
    forecastModel,
    issueBucket,
    maxAgeHours: limits.biasMaxAgeHours,
    adjustments,
    metrics: {
      sampleCount: samples.length,
      temperature: temperatureMetrics,
      icons: iconMetrics
    }
  };
}

function normalizedForecastDay(day) {
  return {
    horizonDays: Number(day.horizonDays),
    minC: round(day.minC, 1),
    maxC: round(day.maxC, 1),
    periods: {
      AM: {
        type: day.periods?.AM?.type || 'cloud',
        label: day.periods?.AM?.label || shortWeatherLabel(day.periods?.AM?.type || 'cloud')
      },
      PM: {
        type: day.periods?.PM?.type || 'cloud',
        label: day.periods?.PM?.label || shortWeatherLabel(day.periods?.PM?.type || 'cloud')
      }
    }
  };
}

function adjustedTemperaturePair(rawMin, rawMax, minAdjustment, maxAdjustment) {
  const rawMinC = round(rawMin, 1);
  const rawMaxC = round(rawMax, 1);
  let minC = rawMinC;
  let maxC = rawMaxC;

  if (minAdjustment?.applied && Number.isFinite(Number(minAdjustment.delta))) {
    minC = round(rawMinC + Number(minAdjustment.delta), 1);
  }
  if (maxAdjustment?.applied && Number.isFinite(Number(maxAdjustment.delta))) {
    maxC = round(rawMaxC + Number(maxAdjustment.delta), 1);
  }

  if (Number.isFinite(minC) && Number.isFinite(maxC) && minC > maxC) {
    minC = rawMinC;
    maxC = rawMaxC;
  }

  return { minC, maxC };
}

function snowImplausible(minC, maxC) {
  return Number.isFinite(minC) && Number.isFinite(maxC) && minC > 2 && maxC > 3;
}

export function applyForecastBias(forecastDay, model) {
  const day = normalizedForecastDay(forecastDay);
  const adjustment = model?.adjustments?.[String(day.horizonDays)] || model?.adjustments?.[day.horizonDays];
  if (!adjustment) return day;

  const temperatures = adjustedTemperaturePair(day.minC, day.maxC, adjustment.minC, adjustment.maxC);
  const periods = {};

  for (const period of PERIOD_LABELS) {
    const rawType = day.periods[period].type;
    let type = adjustment.periods?.[period]?.overrides?.[rawType] || rawType;
    if (type === 'snow' && snowImplausible(temperatures.minC, temperatures.maxC)) {
      type = 'cloud';
    }
    periods[period] = {
      type,
      label: shortWeatherLabel(type)
    };
  }

  return {
    horizonDays: day.horizonDays,
    minC: temperatures.minC,
    maxC: temperatures.maxC,
    periods
  };
}

export function isUsableBiasModel(model, location = DEFAULT_LOCATION, now = new Date()) {
  if (!model || typeof model !== 'object') return false;
  if (Number(model.schemaVersion) !== SCHEMA_VERSION) return false;
  if (!locationsMatch(model.location, location)) return false;
  if (!String(model.forecastSource || '').trim() || !String(model.forecastModel || '').trim()) return false;

  const generatedAt = new Date(model.generated_at).getTime();
  if (!Number.isFinite(generatedAt)) return false;

  const maxAgeHours = Number(model.maxAgeHours || DEFAULT_LIMITS.biasMaxAgeHours);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) return false;

  return now.getTime() - generatedAt <= maxAgeHours * 60 * 60 * 1000;
}
