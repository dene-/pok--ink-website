---
name: e1002-epaper-screens
description: Use when creating, editing, reviewing, or preprocessing static HTML/CSS/JS screens for Seeed reTerminal E1002 and SenseCraft HMI, including 800x480 dashboards, weather panels, photo pages, and batch image assets.
---

# E1002 ePaper Screens

## Overview

Build static device-targeted screens for the Seeed reTerminal E1002. Optimize for the actual 800x480 full-color ePaper surface, SenseCraft HMI embedding, slow refreshes, and black-and-white readability before visual polish.

## Working Rules

- Treat each page as a fixed device screen, not a responsive website.
- Preserve an exact 800x480 target unless the user explicitly changes the canvas.
- Keep useful content visible with no scrolling, hover dependency, login flow, popup, secret, or local-only path.
- Prefer static, self-contained HTML, CSS, and plain JavaScript.
- Avoid continuous animation, blinking, rapid timers, video-like effects, and frequent DOM updates.
- Design black-and-white first: use strong contrast, thick-enough strokes, stable pixel font sizes, and visible fallback states.
- Use color only as a secondary cue. Do not rely on subtle grayscale or hue differences.
- Use the bitmap-derived terminal fonts in `assets/fonts/` for text-heavy screens when available.
- Keep remote images and APIs optional enough that the screen still renders useful fallback content.

## Workflow

1. Read `AGENTS.md` and the target file before editing. Keep any project-specific device facts or hosting assumptions authoritative.
2. Identify the output surface: full page, iframe/photo panel, dashboard widget, weather panel, or preprocessing script output.
3. Lock the layout to deterministic dimensions. Use fixed pixel tracks or explicit aspect ratios for panels, icons, image slots, and text blocks.
4. For weather or API-backed screens, prefer no-key public APIs or server/proxy boundaries; never add client-side secrets.
5. For photo/image workflows, size and crop to the final display area before runtime. Prefer local optimized assets when reliability matters.
6. Add fallback rendering for failed images, fonts, API fetches, and iframes when the screen would otherwise be blank.
7. Verify the changed surface at exactly 800x480. Check no unwanted scrolling, no text overlap, no clipped labels, and acceptable iframe/image fallback behavior.

## Batch Image Processing

When processing a new image batch:

- Inspect the existing script and JSON schema first; preserve output contracts used by `index.html` or `dashboard.html`.
- Deduplicate and replace intentionally. Do not silently mix old and new batches unless the user asks for incremental output.
- Crop to the display slot, usually 800x480 or the dashboard panel aspect ratio, before compression.
- Prefer subject-aware crop libraries such as `smartcrop` when the user wants better framing.
- Write a manifest with stable relative paths and dimensions so runtime code does not need layout guesses.
- Verify a representative sample visually or structurally, plus count totals and missing/failed assets.

## Completion Checklist

- The page renders useful content at 800x480.
- The viewport does not scroll unless explicitly intended.
- Text fits without overlap or antialias-dependent low-contrast edges.
- Remote images, fonts, APIs, and iframes have acceptable fallback behavior.
- Generated image manifests and page arrays match the produced assets.
- Device, runtime, hosting, or page-purpose assumptions changed by the task are reflected in `AGENTS.md`.
