# AM/PM Forecast Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace misleading single daily forecast icons with AM/PM icon+label summaries derived from Open-Meteo hourly data.

**Architecture:** Keep the project static and inline, matching the current dashboard style. Extend the Open-Meteo request in `scripts/update-weather.mjs` and `dashboard.html`, then add small pure helper functions in `dashboard.html` to summarize hourly weather by period and render two compact blocks per forecast tile.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node script using native `fetch`.

---

### Task 1: Extend Open-Meteo Data Requests

**Files:**
- Modify: `scripts/update-weather.mjs`
- Modify: `dashboard.html`

- [x] Add hourly forecast fields to both request builders:

```js
hourly: 'weather_code,cloud_cover,precipitation_probability,precipitation,rain,showers,is_day'
```

- [x] Run the weather update script:

```sh
npm run update:weather
```

Expected: `weather.json` is regenerated with an `hourly` object and no script errors.

### Task 2: Add Forecast Period Summaries

**Files:**
- Modify: `dashboard.html`

- [x] Add helper functions near the existing weather description/icon helpers:

```js
function periodHoursForLabel(label) {
  return label === 'AM' ? { start: 6, end: 11 } : { start: 12, end: 20 };
}

function shortWeatherLabel(type) {
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
```

- [x] Add a `summarizeForecastPeriod(data, isoDate, label, dailyCode)` helper that filters hourly entries by local date and hour, chooses `storm`, `showers`, `rain`, `snow`, `fog`, `cloud`, or `sun`, and falls back to `weatherIconType(dailyCode)`.

### Task 3: Render AM/PM Blocks

**Files:**
- Modify: `dashboard.html`

- [x] Replace each forecast tile's single `.forecastIcon` and `.forecastDesc` content with a `.forecastPeriods` container containing two `.forecastPeriod` blocks.

- [x] Update `updateForecastDay(index, data)` so it renders AM and PM summaries for each day.

- [x] Keep existing min/max temperature rendering unchanged.

### Task 4: CSS Fit and E1002 Verification

**Files:**
- Modify: `dashboard.html`

- [x] Add high-contrast CSS for `.forecastPeriods`, `.forecastPeriod`, `.forecastPeriodLabel`, `.forecastPeriodIcon`, and `.forecastPeriodText`.

- [x] Preview at exactly 800 by 480 using a local static server.

- [x] Confirm no unwanted scrolling and that labels fit in all five forecast tiles.
