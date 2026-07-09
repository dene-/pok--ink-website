# Ubiquitous Language

## Device and display surface

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **E1002 screen** | A static 800 by 480 page intended for the Seeed reTerminal E1002 ePaper display. | Website, responsive page |
| **Dashboard** | The E1002 screen in `dashboard.html` that shows photo, weather, forecast, wind, and sensor panels. | Weather page, app |
| **Photo page** | The E1002 screen in `index.html` that displays one image edge-to-edge. | Image app, slideshow |
| **SenseCraft web surface** | The iframe-like runtime surface in SenseCraft HMI that loads hosted E1002 screens on the device. | Browser, webview |
| **Photo panel** | The dashboard area that embeds the photo page in an iframe. | Image frame, live iframe |

## Weather data pipeline

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Generated weather** | The latest Open-Meteo forecast JSON produced by the GitHub Actions workflow and published to the `weather-data` branch. | Live weather, remote weather |
| **Generated data branch** | The force-pushed `weather-data` branch that contains generated runtime JSON files. | Weather branch, data branch |
| **Same-origin weather fallback** | The root `./weather.json` file placed into the GitHub Pages artifact by the weather workflow so cold Dashboard loads can render before cross-origin generated weather finishes, without committing generated updates to `main`. | Local weather, development fallback, sample weather |
| **Weather cache** | Browser storage of previously loaded generated weather for temporary offline or failure fallback. | Cached local weather, stored forecast |
| **Bias history** | The generated `weather-bias-history.json` state containing forecast snapshots and resolved actuals. | History JSON, training history |
| **Bias model** | The generated `weather-bias.json` runtime model containing gated corrections and metrics. | Correction file, bias JSON |

## Forecast learning

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Forecast snapshot** | A stored copy of the displayed forecast for one target date and horizon at a capture bucket. | Sample, record |
| **Target date** | The local calendar date that a forecast snapshot predicts. | Forecast date, day |
| **Horizon** | The number of days between the forecast issue date and the target date, limited to days 1 through 5. | Lead time, forecast day |
| **Capture bucket** | The local issue window used to group forecast snapshots as `morning` or `evening`. | Issue bucket, run bucket |
| **Actuals** | Historical Open-Meteo observations or archive values used as truth for a completed target date. | Ground truth, history data |
| **Resolved snapshot** | A forecast snapshot that has actuals attached and can contribute to the bias model. | Completed sample, scored forecast |
| **Unresolved snapshot** | A forecast snapshot whose target date is not complete or whose actuals have not been fetched yet. | Pending sample |
| **Recency weighting** | A model calculation rule that gives newer resolved snapshots more influence than older ones. | Decay, freshness weighting |
| **Correction gate** | A rule that applies a correction only when resolved history shows measured improvement. | Guard, threshold |
| **Temperature correction** | A horizon-specific adjustment to displayed forecast minimum or maximum temperature. | Temp bias, degree offset |
| **Icon correction** | A categorical override from one normalized weather icon type to another. | Weather-code bias, icon bias |
| **Wet false-positive suppression** | A cautious icon correction that downgrades unsupported wet forecasts when past forecasts predicted wet weather too often. | Rain suppression, dry correction |

## Forecast interpretation

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Forecast period** | One half-day forecast block in a forecast tile, either AM or PM. | Period, daypart |
| **AM period** | The local hourly forecast window from 00:00 through 11:00. | Morning |
| **PM period** | The local hourly forecast window from 12:00 through 23:00. | Afternoon, evening |
| **Normalized weather type** | The small icon vocabulary used by the dashboard: sun, cloud, fog, showers, rain, snow, or storm. | Weather code, condition |
| **Wet forecast** | A forecast period whose precipitation probability or precipitation total supports a wet icon. | Rain forecast |
| **Dry forecast** | A forecast period without enough precipitation support for a wet icon. | Non-rain forecast |
| **Snow guard** | A rule that prevents corrected icons from showing snow when corrected temperatures make snow implausible. | Snow sanity check |

## Forecast data sources

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Open-Meteo Forecast API** | The Open-Meteo API used by the workflow to fetch the current 6-day forecast. | Weather API |
| **Open-Meteo Historical Weather API** | The Open-Meteo archive API used to fetch completed hourly actuals. | History API, actual API |
| **Open-Meteo Previous Runs API** | The Open-Meteo API that exposes fixed-offset past forecasts for forecast-skill analysis. | History forecast API, past forecast API |
| **Open-Meteo Ensemble API** | The Open-Meteo API exposing ensemble members for uncertainty and agreement analysis. | Multi-model forecast |
| **Lagged ensemble consensus** | A forecast method that compares current and previous forecast runs for agreement instead of learning from actuals. | Forecast consensus, run stability |
| **Forecast bias correction** | A post-processing strategy that learns systematic forecast error from forecast-versus-actual history. | Calibration, MOS |

## Relationships

- A **Dashboard** contains one **Photo panel** and five displayed forecast tiles.
- A **Forecast snapshot** belongs to exactly one **Target date**, one **Horizon**, and one **Capture bucket**.
- A **Resolved snapshot** is an **Unresolved snapshot** plus **Actuals**.
- **Bias history** contains many **Forecast snapshots** keyed by location and timezone.
- A **Bias model** is derived from **Bias history** and may apply zero or more **Temperature corrections** and **Icon corrections**.
- **Generated weather**, **Bias history**, and **Bias model** are published together on the **Generated data branch**.
- The **Dashboard** can render **Weather cache** or the **Same-origin weather fallback** during startup, then replace it with **Generated weather** when available.
- **Lagged ensemble consensus** can use forecast data only, while **Forecast bias correction** requires **Actuals**.

## Example dialogue

> **Dev:** "Should the **Dashboard** call the **Open-Meteo Forecast API** directly when **Generated weather** is missing?"
>
> **Domain expert:** "No. In production it should use the **Generated data branch**, with the **Weather cache** and **Same-origin weather fallback** covering cold starts and source failures."
>
> **Dev:** "When can a **Temperature correction** affect the five-day row?"
>
> **Domain expert:** "Only when enough **Resolved snapshots** show the correction improves accuracy for that **Horizon** and **Capture bucket**."
>
> **Dev:** "Can the **Bias model** change today's current weather panel?"
>
> **Domain expert:** "No. The **Bias model** only corrects the bottom forecast row; current weather and sensor values stay raw."
>
> **Dev:** "Could **Lagged ensemble consensus** replace **Forecast bias correction**?"
>
> **Domain expert:** "It can improve run-to-run stability using forecasts only, but it cannot learn local bias because it does not compare forecasts to **Actuals**."

## Flagged ambiguities

- "Live weather" was used both for direct browser calls to Open-Meteo and for workflow-generated weather. Use **Generated weather** for workflow output and **Open-Meteo Forecast API** for direct source data.
- "History" can mean forecast learning state, historical actuals, or previous forecasts. Use **Bias history**, **Actuals**, and **Open-Meteo Previous Runs API** respectively.
- "Bias JSON" can mean either raw history or the runtime model. Use **Bias history** for `weather-bias-history.json` and **Bias model** for `weather-bias.json`.
- "Issue bucket" and "capture bucket" describe the same domain concept. Use **Capture bucket** in domain language; implementation code may still use `issueBucket`.
- "Wet" should not mean any wet weather code. Use **Wet forecast** only when precipitation probability or precipitation total supports the wet state.
