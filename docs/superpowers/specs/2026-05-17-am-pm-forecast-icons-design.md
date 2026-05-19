# AM/PM Forecast Icons Design

## Goal

Make the E1002 dashboard forecast icons less misleading by showing separate morning and evening weather summaries for each forecast day.

## Design

Each forecast tile shows two compact period blocks: `AM` and `PM`. Each block contains a small high-contrast icon and one short fixed label. Labels are constrained to `Clear`, `Clouds`, `Showers`, `Rain`, `Storm`, `Fog`, and `Snow` so they fit inside narrow forecast columns on the 800 by 480 ePaper layout.

The dashboard continues using Open-Meteo. It adds hourly fields to the request and derives AM/PM forecast states from hourly daytime data instead of using `daily.weather_code` directly. Daily high and low temperatures remain based on Open-Meteo daily values.

## Data Rules

For each forecast date, derive:

- `AM` from local hourly entries 00:00 through 11:00, representing 00:00-11:59.
- `PM` from local hourly entries 12:00 through 23:00, representing 12:00-23:59.
- A period summary counts the normalized icon type for every hourly entry in the period and displays the type used most often.
- Rain, showers, snow, storm, fog, cloud, and clear states do not receive severity priority; they win only by appearing most often in the period.
- If two icon types appear equally often, the type seen first in that period wins so the result is deterministic without severity weighting.

## Layout Rules

The existing five-day forecast row remains in place. Each tile replaces the single large forecast icon and description with two small period blocks. The forecast date includes weekday and date, for example `Mon 18/05`. Period blocks do not use boxed borders because the forecast row is already tightly framed; the small icons use scaled strokes so they remain legible at reduced size. Text must stay fixed-size, high contrast, and fit without hover, scrolling, animation, or runtime layout shifts.

## Fallbacks

If hourly forecast data is unavailable, each period falls back to the daily `weather_code` for that date. Existing local `weather.json` behavior remains supported after the update script starts writing the new hourly fields.
