#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/update-weather.yml', import.meta.url);

test('weather workflow deploys a current same-origin fallback through a Pages artifact', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const dashboard = await readFile(new URL('../dashboard.html', import.meta.url), 'utf8');
  const artifactStep = workflow.indexOf('- name: Prepare Pages artifact');
  const generatedBranchStep = workflow.indexOf('- name: Publish generated weather branch');

  assert.match(workflow, /push:\s*\n\s+branches:\s*\n\s+- main/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.ok(generatedBranchStep >= 0, 'generated-data branch publication remains configured');
  assert.ok(artifactStep > generatedBranchStep, 'Pages artifact is prepared after generated data is published');

  const artifact = workflow.slice(artifactStep);
  assert.match(artifact, /node scripts\/prepare-pages-site\.mjs/);
  assert.doesNotMatch(artifact, /rsync -a/);
  assert.match(artifact, /uses: actions\/configure-pages@v6/);
  assert.match(artifact, /uses: actions\/upload-pages-artifact@v5/);
  assert.match(artifact, /path: \$\{\{ runner\.temp \}\}\/pages-site/);
  assert.match(workflow, /deploy-pages:\s*\n\s+needs: update-weather/);
  assert.match(workflow, /uses: actions\/deploy-pages@v5/);
  assert.match(workflow, /- cron: '17 \* \* \* \*'/);
  assert.match(workflow, /- cron: '47 \* \* \* \*'/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /update-weather:\s*\n\s+runs-on: ubuntu-latest\s*\n\s+timeout-minutes: 10/);
  assert.match(workflow, /deploy-pages:\s*\n\s+needs: update-weather\s*\n\s+timeout-minutes: 10/);
  assert.match(workflow, /REQUIRE_OPENWEATHER_API_KEY: 'true'/);

  const updateWeather = dashboard.slice(dashboard.indexOf('async function updateWeather'));
  const localFallback = updateWeather.indexOf('fetchLocalWeather()');
  const existingDataFallback = updateWeather.indexOf('if (weatherHasData &&');
  assert.ok(localFallback >= 0, 'runtime has a same-origin weather fallback');
  assert.ok(existingDataFallback >= 0, 'runtime preserves usable existing weather data');
  assert.ok(localFallback < existingDataFallback, 'same-origin fallback is attempted before preserving an old snapshot');
  assert.match(dashboard, /apparent_temperature/);
  assert.match(dashboard, /forecastProvenance/);
  assert.match(dashboard, /schemaVersion\) !== 2/);
  assert.match(dashboard, /id="photoImage"/);
  assert.doesNotMatch(dashboard, /id="photoFrame"/);
  assert.match(dashboard, /photoPanel img\.photoFallback/);
  assert.match(dashboard, /\.forecastDate \{[\s\S]*?font-family: var\(--font-compact\);[\s\S]*?font-size: 8px;/);
  assert.match(dashboard, /\.windValue \{[\s\S]*?font-size: 16px;[\s\S]*?max-width: 100%;/);
  assert.match(dashboard, /publishedMaxAgeMinutes: 90/);
  assert.match(dashboard, /emergencyMaxAgeMinutes: 90/);
  assert.match(dashboard, /freshJsonUrl/);
  assert.match(dashboard, /fetchRemoteWeather\(initial, useEmergencyWeather\)/);

  assert.doesNotMatch(workflow, /^\s*git add weather\.json\s*$/m);
  assert.doesNotMatch(workflow, /git push origin HEAD:main/);
  assert.doesNotMatch(workflow, /repos\/\$\{GITHUB_REPOSITORY\}\/pages\/builds/);
});
