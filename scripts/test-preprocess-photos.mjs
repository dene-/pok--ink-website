#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  cleanOutputDirectory,
  createImageId,
  normalizeSourceImages
} from './preprocess-photos-lib.mjs';

test('normalizes URL-array source data into generated image entries', () => {
  const images = normalizeSourceImages([
    'https://example.test/one.jpg',
    'https://example.test/two.jpg'
  ]);

  assert.deepEqual(images, [
    { id: 'iceland-001', source: 'https://example.test/one.jpg' },
    { id: 'iceland-002', source: 'https://example.test/two.jpg' }
  ]);
});

test('preserves existing object entries from manifest-shaped source data', () => {
  const images = normalizeSourceImages({
    images: [{ id: 'custom-001', source: 'https://example.test/custom.jpg' }]
  });

  assert.deepEqual(images, [
    { id: 'custom-001', source: 'https://example.test/custom.jpg' }
  ]);
});

test('creates stable padded generated ids', () => {
  assert.equal(createImageId(0), 'iceland-001');
  assert.equal(createImageId(668), 'iceland-669');
});

test('cleans only generated PNG photos from the output directory', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pok-ink-photos-'));

  try {
    await writeFile(path.join(dir, 'iceland-001.png'), 'old');
    await writeFile(path.join(dir, 'keep.txt'), 'keep');

    await cleanOutputDirectory(dir);

    await assert.rejects(readFile(path.join(dir, 'iceland-001.png')), {
      code: 'ENOENT'
    });
    assert.equal(await readFile(path.join(dir, 'keep.txt'), 'utf8'), 'keep');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('index photo count matches the new image batch size', async () => {
  const sourceImages = JSON.parse(await readFile('newimages.json', 'utf8'));
  const indexHtml = await readFile('index.html', 'utf8');
  const photoCountMatch = indexHtml.match(/const PHOTO_COUNT = (\d+);/);

  assert.ok(photoCountMatch, 'index.html should define PHOTO_COUNT');
  assert.equal(Number(photoCountMatch[1]), sourceImages.length);
});
