import { createWorker, PSM, type Worker } from "tesseract.js";

export type TrailerOcrResult = {
  trailerNumber?: string;
  licensePlate?: string;
  company?: "DFDS" | "DSV";
};

// Danish plates aren't always 2 letters + 5 digits ("AB 12 345") — trailers
// in particular are often 2 letters + 4 digits ("FY 62 17"). Match 2 letters
// followed by a run of 4-6 digits (tolerating whitespace/hyphens the OCR
// inserts between every group, or even between individual digits), then
// re-group for display rather than assuming a fixed digit count.
const PLATE_REGEX = /\b([A-ZÆØÅ]{2})[\s-]*((?:\d[\s-]*){4,6})\b/;
const NUMBER_REGEX = /\b(\d{3,6})\b/g;

function formatPlateDigits(digits: string): string {
  if (digits.length === 4 || digits.length === 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  if (digits.length === 6) return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4)}`;
  return digits;
}

// Self-hosted (not the jsdelivr CDN tesseract.js defaults to) so OCR keeps
// working even when third-party CDNs are unreachable, and so the exact
// worker/core version always matches the installed tesseract.js package.
const TESSERACT_ASSETS = {
  workerPath: "/tesseract/worker.min.js",
  corePath: "/tesseract/tesseract-core-lstm.wasm.js",
  langPath: "/tesseract/eng",
};

function isEmpty(result: TrailerOcrResult): boolean {
  return !result.trailerNumber && !result.licensePlate;
}

async function recognizeOnce(worker: Worker, source: HTMLCanvasElement): Promise<TrailerOcrResult> {
  const {
    data: { text },
  } = await worker.recognize(source);
  return parseOcrText(text);
}

export async function recognizeTrailerImage(source: HTMLCanvasElement): Promise<TrailerOcrResult> {
  const worker = await createWorker("eng", 1, TESSERACT_ASSETS);
  try {
    // Tesseract is built for scanned documents, not embossed/reflective
    // vehicle-style plates photographed at an angle — a whitelist (no stray
    // punctuation candidates) and a page-segmentation mode suited to a
    // single block of large text both noticeably help on this kind of shot.
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ0123456789 ",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });

    const first = await recognizeOnce(worker, source);
    if (!isEmpty(first)) return first;

    // First pass found nothing at all — retry against a high-contrast,
    // black/white version of the same photo (Otsu thresholding). Lighting,
    // glare and low contrast on a plate are the most common reasons OCR
    // comes back empty, and binarizing often recovers text a greyscale
    // pass misses.
    const binarized = binarizeForOcr(source);
    const second = await recognizeOnce(worker, binarized);
    if (!isEmpty(second)) return second;

    // Still nothing — last attempt, treating the plate as a single line of
    // text rather than a block. Empirically this configuration reads the
    // most characters correctly on plates the two passes above miss
    // entirely, even though it isn't reliably exact.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
    return await recognizeOnce(worker, binarized);
  } finally {
    await worker.terminate();
  }
}

export function parseOcrText(rawText: string): TrailerOcrResult {
  const text = rawText.toUpperCase();
  const result: TrailerOcrResult = {};

  const plateMatch = text.match(PLATE_REGEX);
  let searchText = text;
  if (plateMatch) {
    const digits = plateMatch[2].replace(/[\s-]/g, "");
    result.licensePlate = `${plateMatch[1]} ${formatPlateDigits(digits)}`;
    // Blank out the matched plate span so its digits can't also be picked up
    // as a standalone trailer-number candidate below.
    searchText = text.slice(0, plateMatch.index) + " ".repeat(plateMatch[0].length) + text.slice((plateMatch.index ?? 0) + plateMatch[0].length);
  }

  const numberCandidates = [...searchText.matchAll(NUMBER_REGEX)].map((m) => m[1]);

  // Prefer a 3-4 digit number starting with "500" (typically a DSV trailer),
  // otherwise take the first plausible standalone number found.
  const dsvCandidate = numberCandidates.find((n) => n.startsWith("500"));
  const trailerNumber = dsvCandidate ?? numberCandidates[0];

  if (trailerNumber) {
    result.trailerNumber = trailerNumber;
    if (trailerNumber.startsWith("500")) result.company = "DSV";
  }

  return result;
}

const MAX_DIMENSION = 1600;

export function loadImageToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Kunne ikke behandle billedet."));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Kunne ikke indlæse billedet."));
    };
    img.src = objectUrl;
  });
}

/** Grayscale + Otsu auto-threshold black/white conversion — a standard,
 * cheap way to make photographed text stand out for OCR when plain
 * greyscale isn't enough (glare, low contrast, uneven lighting). */
export function binarizeForOcr(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const pixelCount = data.length / 4;
  const gray = new Uint8ClampedArray(pixelCount);
  const histogram = new Array<number>(256).fill(0);

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const luminance = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
    gray[i] = luminance;
    histogram[luminance]++;
  }

  const threshold = otsuThreshold(histogram, pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const v = gray[i] >= threshold ? 255 : 0;
    const o = i * 4;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function otsuThreshold(histogram: number[], totalPixels: number): number {
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * histogram[t];

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = 0;
  let threshold = 127;

  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;
    const weightForeground = totalPixels - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;
    const betweenVariance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (betweenVariance > maxVariance) {
      maxVariance = betweenVariance;
      threshold = t;
    }
  }

  return threshold;
}
