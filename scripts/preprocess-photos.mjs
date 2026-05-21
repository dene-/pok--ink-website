#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TARGET_HEIGHT,
  TARGET_WIDTH,
  cleanOutputDirectory,
  normalizeSourceImages,
  processImage,
  toRelativeAssetPath
} from './preprocess-photos-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE_PATH = path.join(ROOT, 'newimages.json');
const OUTPUT_DIR = path.join(ROOT, 'assets', 'photos');
const MANIFEST_PATH = path.join(ROOT, 'optimized-images.json');

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [name, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [name, value];
  })
);

const sourcePath = path.resolve(ROOT, args.get('source') || DEFAULT_SOURCE_PATH);
const outputDir = path.resolve(ROOT, args.get('output-dir') || OUTPUT_DIR);
const manifestPath = path.resolve(ROOT, args.get('manifest') || MANIFEST_PATH);
const limit = args.has('limit') ? Number.parseInt(args.get('limit'), 10) : null;
const shouldClean =
  args.get('clean') === 'true' || (!args.has('clean') && !Number.isInteger(limit));

const sourceData = JSON.parse(await readFile(sourcePath, 'utf8'));
const sourceImages = normalizeSourceImages(sourceData);
const images = sourceImages.slice(0, limit || undefined);
const processed = [];
const failed = [];

if (shouldClean) {
  await cleanOutputDirectory(outputDir);
} else {
  await mkdir(outputDir, { recursive: true });
}

for (const [index, image] of images.entries()) {
  const label = image.id || `image ${index + 1}`;

  try {
    const entry = await processImage({
      image,
      index,
      outputDir,
      root: ROOT
    });
    processed.push(entry);
    console.log(`${index + 1}/${images.length} ${label} -> ${entry.src} (${entry.width}x${entry.height})`);
  } catch (error) {
    failed.push({
      id: label,
      source: image.source,
      error: error instanceof Error ? error.message : String(error)
    });
    console.warn(`${index + 1}/${images.length} ${label} failed: ${failed.at(-1).error}`);
  }
}

if (processed.length === 0) {
  throw new Error('No photos were processed');
}

await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      source: toRelativeAssetPath(ROOT, sourcePath),
      palette: 'aitjcizeSpectra6Palette',
      target_width: TARGET_WIDTH,
      target_height: TARGET_HEIGHT,
      crop: 'smartcrop',
      resize_kernel: 'lanczos3',
      cleaned_output_dir: shouldClean,
      images: processed,
      failed
    },
    null,
    2
  )}\n`
);

console.log(`Wrote ${processed.length} processed photos to ${toRelativeAssetPath(ROOT, manifestPath)}`);

if (failed.length > 0) {
  console.warn(`${failed.length} photos failed; see ${toRelativeAssetPath(ROOT, manifestPath)}`);
}
