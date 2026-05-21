import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createCanvas, loadImage } from 'canvas';
import {
  aitjcizeSpectra6Palette,
  ditherImage,
  replaceColors
} from 'epdoptimize';
import sharp from 'sharp';
import smartcrop from 'smartcrop';

export const TARGET_WIDTH = 800;
export const TARGET_HEIGHT = 480;
export const FETCH_TIMEOUT_MS = 30000;
export const ERROR_DIFFUSION_MATRIX = 'atkinson';

const PALETTE_HEX = new Set(
  aitjcizeSpectra6Palette.map((entry) => entry.deviceColor.toLowerCase())
);

export function createImageId(index) {
  return `iceland-${String(index + 1).padStart(3, '0')}`;
}

export function normalizeSourceImages(sourceData) {
  const entries = Array.isArray(sourceData) ? sourceData : sourceData.images;

  if (!Array.isArray(entries)) {
    throw new Error('Photo source must be an array or an object with an images array');
  }

  return entries.map((entry, index) => {
    if (typeof entry === 'string') {
      return {
        id: createImageId(index),
        source: entry
      };
    }

    if (entry && typeof entry === 'object' && typeof entry.source === 'string') {
      return {
        ...entry,
        id: entry.id || createImageId(index)
      };
    }

    throw new Error(`Photo entry ${index + 1} must be a URL string or an object with a source URL`);
  });
}

export async function cleanOutputDirectory(outputDir) {
  await mkdir(outputDir, { recursive: true });
  const entries = await readdir(outputDir, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^iceland-\d+\.png$/.test(entry.name))
      .map((entry) => rm(path.join(outputDir, entry.name)))
  );
}

export function toRelativeAssetPath(root, absolutePath) {
  return `./${path.relative(root, absolutePath).split(path.sep).join('/')}`;
}

function cssHexFromPixel(data, index) {
  return `#${[data[index], data[index + 1], data[index + 2]]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`.toLowerCase();
}

export function assertDevicePalette(canvas, id) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < data.length; index += 4) {
    const hex = cssHexFromPixel(data, index);
    if (!PALETTE_HEX.has(hex)) {
      throw new Error(`${id} produced non-Spectra-6 color ${hex}`);
    }
  }
}

export async function fetchImageBuffer(source) {
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

async function orientImage(buffer) {
  const output = await sharp(buffer).rotate().png().toBuffer();
  const metadata = await sharp(output).metadata();

  return {
    buffer: output,
    width: metadata.width,
    height: metadata.height
  };
}

async function findSmartCrop({ buffer, width, height }) {
  const image = await loadImage(buffer);
  const result = await smartcrop.crop(image, {
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
    minScale: 1,
    canvasFactory: createCanvas
  });

  const crop = result.topCrop;
  return {
    left: Math.max(0, Math.min(width - crop.width, crop.x)),
    top: Math.max(0, Math.min(height - crop.height, crop.y)),
    width: Math.min(width, crop.width),
    height: Math.min(height, crop.height)
  };
}

export async function cropImage(buffer) {
  const oriented = await orientImage(buffer);
  const crop = await findSmartCrop(oriented);
  const output = await sharp(oriented.buffer)
    .extract(crop)
    .resize({
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
      fit: 'fill',
      kernel: sharp.kernel.lanczos3
    })
    .png()
    .toBuffer();

  return {
    buffer: output,
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
    crop
  };
}

export async function ditherToSpectra6({ buffer, width, height }, outputPath) {
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
    errorDiffusionMatrix: ERROR_DIFFUSION_MATRIX,
    serpentine: true,
    colorMatching: 'lab'
  });

  replaceColors(ditheredCanvas, deviceCanvas, aitjcizeSpectra6Palette);
  assertDevicePalette(deviceCanvas, outputPath);

  await writeFile(outputPath, deviceCanvas.toBuffer('image/png'));
}

export async function processImage({ image, index, outputDir, root }) {
  const id = image.id || createImageId(index);
  const outputPath = path.join(outputDir, `${id}.png`);

  const sourceBuffer = await fetchImageBuffer(image.source);
  const cropped = await cropImage(sourceBuffer);
  await ditherToSpectra6(cropped, outputPath);

  return {
    id,
    src: toRelativeAssetPath(root, outputPath),
    source: image.source,
    width: cropped.width,
    height: cropped.height,
    crop: cropped.crop
  };
}
