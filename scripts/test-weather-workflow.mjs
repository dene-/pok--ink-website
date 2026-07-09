#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/update-weather.yml', import.meta.url);

test('weather workflow publishes a current same-origin dashboard fallback before generated data', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const fallbackStep = workflow.indexOf('- name: Publish same-origin weather fallback');
  const generatedBranchStep = workflow.indexOf('- name: Publish generated weather branch');

  assert.ok(fallbackStep >= 0, 'same-origin fallback publishing step exists');
  assert.ok(generatedBranchStep > fallbackStep, 'fallback is published before the generated-data branch');

  const step = workflow.slice(fallbackStep, generatedBranchStep);
  assert.match(step, /cp "\$WEATHER_OUTPUT_DIR"\/weather\.json weather\.json/);
  assert.match(step, /git add weather\.json/);
  assert.match(step, /git commit -m "chore: refresh same-origin weather fallback"/);
  assert.match(step, /git push origin HEAD:main/);
  assert.match(workflow, /pages: write/);
  assert.match(step, /gh api --method POST "repos\/\$\{GITHUB_REPOSITORY\}\/pages\/builds"/);
});
