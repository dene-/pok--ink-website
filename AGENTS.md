# AGENTS.md

## Project Purpose

This is a small static HTML project for pages shown on a Seeed Studio
reTerminal E1002 ePaper Display through SenseCraft HMI. Treat every page as a
device-targeted screen, not as a general responsive website.

## Project Skills

- Project-local skills live under `.agents/skills`.
- Use `.agents/skills/e1002-epaper-screens/SKILL.md` whenever creating,
  editing, reviewing, or preprocessing static screens or image assets for the
  reTerminal E1002/SenseCraft HMI target.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `dene-/pok--ink-website`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo. See `docs/agents/domain.md`.

Current pages:

- `index.html`: full-screen random photo page. It chooses one image from an
  in-file array of Unsplash links and displays it edge-to-edge.
- `dashboard.html`: weather display screen for the E1002 canvas. It uses a
  fixed 800 by 480 layout and embeds `index.html` in a live iframe/photo panel.

## Target Device

Primary target: Seeed Studio reTerminal E1002.

Device facts to preserve in future work:

- Display: 7.3 inch full-color ePaper display using E Ink Spectra 6.
- Resolution: 800 by 480 pixels.
- Display technology: ePaper. Design for slow refreshes, high contrast, and
  static reading.
- Processor: ESP32-S3 with 8 MB PSRAM.
- Storage: 32 MB flash plus MicroSD support.
- MicroSD: maximum 32 GB card, FAT32 format.
- Wireless: 2.4 GHz 802.11 b/g/n Wi-Fi and Bluetooth 5.0.
- Sensors: temperature and humidity.
- Other built-in hardware: microphone reserved for voice interaction
  applications, buzzer for sound alerts, top buttons, green status LED, red
  charge LED, USB-C port, power switch, 8-pin expansion header, and stand
  mounting inserts.
- Battery: built-in 2000 mAh battery, advertised by Seeed as up to 3 months
  battery life depending on usage.
- Power input: USB-C 5 V / 1 A.
- Working temperature: 0-40 C.
- Dimensions: 176 mm x 120 mm x 53 mm with stand, or 17 mm thick without stand.
- Colors: the hardware is full-color ePaper, but project screens should still
  work in black and white first. Avoid relying only on hue or subtle grayscale
  differences.
- Refresh model: ePaper refresh is slow compared with LCD/OLED screens. Avoid
  continuous animation, blinking UI, video-like effects, and rapid DOM updates.
- Intended UI size: build pages for the full 800 by 480 viewport unless the
  SenseCraft HMI canvas is explicitly configured otherwise.
- Input expectations: design as a display-first surface. Do not assume mouse
  hover, keyboard use, or complex interactive gestures.
- Supported software paths include SenseCraft HMI, Home Assistant, TRMNL E-ink
  dashboard, Arduino, and ESP-IDF.
- Hardware family: reTerminal E Series ePaper Display. Wireless setup and
  deployment are normally managed from Seeed/SenseCraft tooling rather than from
  this repo.

Primary references:

- Seeed product page:
  https://www.seeedstudio.com/reTerminal-E1002-p-6533.html
- Seeed wiki:
  https://wiki.seeedstudio.com/getting_started_with_reterminal_e1002/
- SenseCraft HMI web documentation:
  https://sensecraft-hmi-docs.seeed.cc/en/guides/workspace/sensecraft-hmi-web/

## SenseCraft HMI Runtime Notes

SenseCraft HMI can show web content on the device through a web/iframe-style
component. Pages in this repo are meant to be hosted and loaded into that live
web surface.

Important constraints:

- Use absolute `https://` or reachable `http://` URLs when configuring pages in
  SenseCraft HMI. The device must be able to reach the host from its network.
- Some sites block iframe embedding with `X-Frame-Options` or
  `Content-Security-Policy: frame-ancestors`. Prefer pages and image hosts that
  allow embedding.
- Avoid depending on login prompts, popups, browser extensions, local file
  paths, or APIs that require secrets in client-side code.
- Assume the page is loaded in a constrained embedded browser surface. Keep CSS
  and JavaScript simple, self-contained, and deterministic.
- For live iframes, make every page render useful content without user action.

## HTML And CSS Guidelines

- Keep files static and browser-native: HTML, CSS, and plain JavaScript are
  preferred unless a real build step is introduced deliberately.
- For E1002 screens, set the viewport and root dimensions deliberately. The
  dashboard currently uses `width=800,height=480` and fixed pixel layout.
- Use high contrast: black text/lines on white, or white on black only when the
  whole design is intentionally inverted.
- Prefer strong type, thick-enough strokes, and simple iconography. Thin lines,
  faint borders, soft shadows, transparent overlays, and low-contrast grays may
  disappear on ePaper.
- Avoid rounded, decorative, or animated UI unless it has a device-specific
  reason. ePaper works best with crisp geometry and stable layouts.
- Prevent scrolling unless the screen is intentionally scrollable. Most device
  pages should use `overflow: hidden` and fit exactly into 800 by 480.
- Avoid viewport-scaled font sizes. Use stable pixel sizes that have been checked
  at 800 by 480.
- For text-heavy E1002 screens, prefer the self-hosted bitmap-derived terminal
  fonts in `assets/fonts/`. Use the 8x16 font at 16 px, 32 px, or 48 px and the
  8x8 compact font at 8 px or 16 px so glyphs stay aligned to the pixel grid.
  Avoid synthetic bold, negative letter spacing, and antialias-dependent gray
  edge pixels for primary text.
- Do not use UI text that explains how the page works. The device should show
  the actual information or image, not instructions.

## JavaScript Guidelines

- Keep scripts small and inline when that matches the current project style.
- Avoid timers that update frequently. If a page must refresh, use the longest
  practical interval for ePaper.
- Handle failed network resources with visible fallback content where practical.
- Do not put API keys, private tokens, or credentials in browser JavaScript.
- For photo pages, prefer deterministic image sizing (`object-fit`, fixed
  viewport dimensions) so the iframe does not reflow.

## Image And Asset Guidelines

- Images should be readable in monochrome. Strong silhouettes and contrast work
  better than subtle color photography.
- Remote images can fail, be rate-limited, or change behavior. Add fallbacks when
  the screen must be reliable.
- If adding local assets, keep them reasonably small and reference them with
  relative paths that work from a static host.
- Avoid huge image downloads when the final display is 800 by 480.

## Weather Dashboard Notes

For `dashboard.html`:

- Preserve the 800 by 480 target unless the device target changes.
- Keep the weather display useful in black and white.
- Avoid adding layout that depends on scrolling or hover.
- If adding weather APIs, keep keys out of the client. Use public no-key APIs or
  a server/proxy if credentials are needed.
- Live weather data is generated by `.github/workflows/update-weather.yml` and
  published to the force-pushed `weather-data` branch as `weather.json`,
  `weather-bias.json`, and `weather-bias-history.json`.
- The production dashboard should prefer generated JSON from the `weather-data`
  branch, then cached generated weather, then the root `./weather.json`
  same-origin fallback. The weather workflow packages the site as a GitHub
  Pages artifact and overwrites that artifact's root fallback with current
  generated weather. It also embeds that snapshot into the deployed dashboard
  so cold device loads can render weather synchronously, without waiting for a
  runtime fetch or committing generated updates to `main`. It should not call
  Open-Meteo directly unless an explicit debug/development URL option enables
  live weather.
- `weather-bias.json` is optional runtime input. Missing, stale, invalid, or
  location-mismatched bias data must fail open to raw forecast display without a
  normal-mode visible error.
- Test the page at exactly 800 by 480 after layout changes.

## Local Preview

These files can be opened directly in a browser, but a local static server is a
better preview because it matches hosted web behavior:

```sh
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000/index.html`
- `http://localhost:8000/dashboard.html`

For dashboard work, preview with an 800 by 480 viewport.

## Verification Checklist

Before finishing changes:

- Open or preview the changed page at 800 by 480.
- Confirm there is no unwanted scrolling.
- Confirm text fits and does not overlap.
- Confirm the page still works when embedded in an iframe, when relevant.
- Confirm remote images, fonts, or APIs have acceptable fallback behavior.
- Keep `AGENTS.md` updated when device, runtime, hosting, or page purpose
  assumptions change.
