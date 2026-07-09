# Actions Pages Weather Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the static site and a fresh same-origin `weather.json` through a GitHub Pages artifact without committing generated weather to `main`.

**Architecture:** The existing weather job remains responsible for generating weather and publishing the `weather-data` branch. It will also stage the checked-out static site in a temporary directory, overwrite that artifact's root `weather.json`, upload the directory as the Pages artifact, and hand it to a dedicated deployment job.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js tests, GitHub Actions, GitHub Pages Actions.

## Global Constraints

- Keep the E1002 dashboard fixed at 800 by 480.
- Keep `weather-data` branch publication and bias-history restoration intact.
- Do not commit generated weather to `main`.
- Deploy on pushes to `main`, the existing hourly schedule, and manual dispatches.
- Keep a fresh `weather.json` at the artifact root for the Dashboard's same-origin cold-start fallback.

---

### Task 1: Replace branch-mutation expectations with artifact-deployment expectations

**Files:**
- Modify: `scripts/test-weather-workflow.mjs`

**Interfaces:**
- Consumes: `.github/workflows/update-weather.yml` as UTF-8 text.
- Produces: regression coverage for trigger, artifact preparation, no-main-mutation, and Pages deployment contracts.

- [ ] **Step 1: Write the failing test**

Assert that the workflow triggers on `main`, grants `id-token: write`, copies generated weather into `$RUNNER_TEMP/pages-site/weather.json`, uploads `$RUNNER_TEMP/pages-site`, deploys with `actions/deploy-pages`, and contains none of `git push origin HEAD:main`, `git add weather.json`, or `/pages/builds`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test scripts/test-weather-workflow.mjs`

Expected: FAIL because the workflow still commits `weather.json` to `main` and does not upload/deploy a Pages artifact.

### Task 2: Publish the Pages artifact from the weather workflow

**Files:**
- Modify: `.github/workflows/update-weather.yml`
- Modify: `AGENTS.md`
- Modify: `UBIQUITOUS_LANGUAGE.md`

**Interfaces:**
- Consumes: generated files under `${{ runner.temp }}/weather-data` and repository static files.
- Produces: a `github-pages` artifact containing the site with fresh root `weather.json`, plus a deployed GitHub Pages release.

- [ ] **Step 1: Implement the minimal workflow**

Add the `main` push trigger and `id-token: write`; remove the step that commits generated weather to `main`; stage the site with `rsync`; overwrite the staged `weather.json`; use `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, and a dependent deployment job using `actions/deploy-pages@v5` in the `github-pages` environment.

- [ ] **Step 2: Update domain documentation**

Describe the same-origin fallback as an artifact-time generated file rather than a tracked `main` mutation.

- [ ] **Step 3: Run focused and full verification**

Run: `node --test scripts/test-weather-workflow.mjs`

Expected: PASS.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 4: Publish and verify production**

Commit and push the migration to `main`, watch the weather and Pages jobs complete, verify deployed `weather.json` is current, and repeat the delayed generated-weather cold-start check at exactly 800 by 480.
