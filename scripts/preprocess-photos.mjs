#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCanvas, loadImage } from 'canvas';
import {
  aitjcizeSpectra6Palette,
  ditherImage,
  replaceColors
} from 'epdoptimize';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = path.join(ROOT, 'images.json');
const OUTPUT_DIR = path.join(ROOT, 'assets', 'photos');
const MANIFEST_PATH = path.join(ROOT, 'optimized-images.json');
const MAX_LONG_SIDE = 800;
const FETCH_TIMEOUT_MS = 30000;
const PALETTE_HEX = new Set(
  aitjcizeSpectra6Palette.map((entry) => entry.deviceColor.toLowerCase())
);

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [name, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [name, value];
  })
);

const limit = args.has('limit') ? Number.parseInt(args.get('limit'), 10) : null;

function toRelativeAssetPath(absolutePath) {
  return `./${path.relative(ROOT, absolutePath).split(path.sep).join('/')}`;
}

function cssHexFromPixel(data, index) {
  return `#${[data[index], data[index + 1], data[index + 2]]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`.toLowerCase();
}

function assertDevicePalette(canvas, id) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < data.length; index += 4) {
    const hex = cssHexFromPixel(data, index);
    if (!PALETTE_HEX.has(hex)) {
      throw new Error(`${id} produced non-Spectra-6 color ${hex}`);
    }
  }
}

async function fetchImageBuffer(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(source, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'pok-ink-website-photo-preprocessor/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

async function resizeImage(buffer) {
  const resized = sharp(buffer)
    .rotate()
    .resize({
      width: MAX_LONG_SIDE,
      height: MAX_LONG_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3
    })
    .png();

  const output = await resized.toBuffer();
  const metadata = await sharp(output).metadata();

  return {
    buffer: output,
    width: metadata.width,
    height: metadata.height
  };
}

async function ditherToSpectra6({ buffer, width, height }, outputPath) {
  const image = await loadImage(buffer);
  const inputCanvas = createCanvas(width, height);
  const inputContext = inputCanvas.getContext('2d');
  inputContext.drawImage(image, 0, 0, width, height);

  const ditheredCanvas = createCanvas(width, height);
  const deviceCanvas = createCanvas(width, height);

  await ditherImage(inputCanvas, ditheredCanvas, {
    palette: aitjcizeSpectra6Palette,
    processingPreset: 'balanced',
    ditheringType: 'errorDiffusion',
    errorDiffusionMatrix: 'floydSteinberg',
    serpentine: true,
    colorMatching: 'lab'
  });

  replaceColors(ditheredCanvas, deviceCanvas, aitjcizeSpectra6Palette);
  assertDevicePalette(deviceCanvas, outputPath);

  await writeFile(outputPath, deviceCanvas.toBuffer('image/png'));
}

async function processImage(image, index) {
  const id = image.id || `iceland-${String(index + 1).padStart(3, '0')}`;
  const outputPath = path.join(OUTPUT_DIR, `${id}.png`);

  const sourceBuffer = await fetchImageBuffer(image.source);
  const resized = await resizeImage(sourceBuffer);
  await ditherToSpectra6(resized, outputPath);

  return {
    id,
    src: toRelativeAssetPath(outputPath),
    source: image.source,
    width: resized.width,
    height: resized.height
  };
}

const sourceData = JSON.parse(await readFile(SOURCE_PATH, 'utf8'));
const images = sourceData.images.slice(0, limit || undefined);
const processed = [];
const failed = [];

await mkdir(OUTPUT_DIR, { recursive: true });

for (const [index, image] of images.entries()) {
  const label = image.id || `image ${index + 1}`;

  try {
    const entry = await processImage(image, index);
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
  MANIFEST_PATH,
  `${JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      source: './images.json',
      palette: 'aitjcizeSpectra6Palette',
      max_long_side: MAX_LONG_SIDE,
      resize_kernel: 'lanczos3',
      images: processed,
      failed
    },
    null,
    2
  )}\n`
);

console.log(`Wrote ${processed.length} processed photos to ${toRelativeAssetPath(MANIFEST_PATH)}`);

if (failed.length > 0) {
  console.warn(`${failed.length} photos failed; see optimized-images.json`);
}
