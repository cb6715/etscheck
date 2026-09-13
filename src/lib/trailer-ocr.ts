import { createWorker } from "tesseract.js";

export type TrailerOcrResult = {
  trailerNumber?: string;
  licensePlate?: string;
  company?: "DFDS" | "DSV";
};

const PLATE_REGEX = /\b([A-ZÆØÅ]{2})\s?(\d{2})\s?(\d{3})\b/;
const NUMBER_REGEX = /\b(\d{3,6})\b/g;

// Self-hosted (not the jsdelivr CDN tesseract.js defaults to) so OCR keeps
// working even when third-party CDNs are unreachable, and so the exact
// worker/core version always matches the installed tesseract.js package.
const TESSERACT_ASSETS = {
  workerPath: "/tesseract/worker.min.js",
  corePath: "/tesseract/tesseract-core-lstm.wasm.js",
  langPath: "/tesseract/eng",
};

export async function recognizeTrailerImage(source: HTMLCanvasElement): Promise<TrailerOcrResult> {
  const worker = await createWorker("eng", 1, TESSERACT_ASSETS);
  try {
    const {
      data: { text },
    } = await worker.recognize(source);
    return parseOcrText(text);
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
    result.licensePlate = `${plateMatch[1]} ${plateMatch[2]} ${plateMatch[3]}`;
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
