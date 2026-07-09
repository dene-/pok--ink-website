#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/update-weather.yml', import.meta.url);

test('weather workflow deploys a current same-origin fallback through a Pages artifact', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
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

  assert.doesNotMatch(workflow, /^\s*git add weather\.json\s*$/m);
  assert.doesNotMatch(workflow, /git push origin HEAD:main/);
  assert.doesNotMatch(workflow, /repos\/\$\{GITHUB_REPOSITORY\}\/pages\/builds/);
});
