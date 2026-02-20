/**
 * omrService.ts
 *
 * Browser-based OMR (Optical Mark Recognition) engine.
 *
 * Pipeline:
 *  1. loadImageToCanvas()     — Load a File/Blob onto a canvas
 *  2. detectCornerMarkers()   — Find the 4 black corner squares
 *  3. perspectiveCorrect()    — Warp canvas to canonical PAGE_W × PAGE_H
 *  4. detectBubbles()         — Sample bubble positions, return filled choices
 *  5. readExamId()            — Attempt to read QR code from scan
 *
 * All coordinates use the OMR constants so they stay in sync with the PDF layout.
 */

import { OMR } from '@/lib/omrLayout';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Point { x: number; y: number; }

export interface DetectionResult {
  /** Map of item number (1-based) → letter choice (A/B/C/D/null) */
  answers: { [item: number]: string | null };
  /** Per-bubble confidence scores (0–1). Low confidence = questionable fill. */
  confidence: { [item: number]: { [choice: string]: number } };
  /** True if corners were detected automatically */
  cornersAutoDetected: boolean;
  /** The 4 detected corner points in source-image coordinates */
  corners: [Point, Point, Point, Point];
}

export type CornerSet = [Point, Point, Point, Point]; // TL, TR, BL, BR

// ─── 1. Load Image to Canvas ──────────────────────────────────────────────────

export function loadImageToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── 2. Corner Marker Detection ───────────────────────────────────────────────

/**
 * Detects the 4 black corner markers by scanning each corner quadrant for
 * the largest dark blob. Returns [TL, TR, BL, BR] in image pixel coordinates.
 */
export function detectCornerMarkers(canvas: HTMLCanvasElement): CornerSet | null {
  const ctx = canvas.getContext('2d')!;
  const { width: W, height: H } = canvas;
  const data = ctx.getImageData(0, 0, W, H).data;

  // Convert to grayscale lookup
  const gray = (i: number) => {
    const base = i * 4;
    return (data[base] * 0.299 + data[base + 1] * 0.587 + data[base + 2] * 0.114);
  };
  const isDark = (i: number) => gray(i) < 85;

  /**
   * Search a rectangular region for the centroid of the largest dark blob.
   */
  function findBlobCenter(rx: number, ry: number, rw: number, rh: number): Point | null {
    let sumX = 0, sumY = 0, count = 0;
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        const i = y * W + x;
        if (isDark(i)) { sumX += x; sumY += y; count++; }
      }
    }
    if (count < 20) return null; // too few dark pixels
    return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
  }

  // Each corner region is 20% × 20% of the image
  const cw = Math.round(W * 0.20);
  const ch = Math.round(H * 0.20);

  const tl = findBlobCenter(0, 0, cw, ch);
  const tr = findBlobCenter(W - cw, 0, cw, ch);
  const bl = findBlobCenter(0, H - ch, cw, ch);
  const br = findBlobCenter(W - cw, H - ch, cw, ch);

  if (!tl || !tr || !bl || !br) return null;

  return [tl, tr, bl, br];
}

// ─── 3. Homography & Perspective Correction ───────────────────────────────────

/**
 * Solves an 8×8 linear system via Gaussian elimination with partial pivoting.
 * Returns the solution vector [x0 .. x7].
 */
function gaussianElim(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) continue;

    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}

/**
 * Computes the 3×3 homography matrix (returned as 9-element array, row-major)
 * that maps src[i] → dst[i] for 4 point correspondences.
 */
function computeHomography(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: xp, y: yp } = dst[i];
    A.push([-x, -y, -1,  0,  0,  0, x * xp, y * xp]);
    b.push(-xp);
    A.push([ 0,  0,  0, -x, -y, -1, x * yp, y * yp]);
    b.push(-yp);
  }

  const h = gaussianElim(A, b);
  // h = [h0..h7], h8 = 1
  return [...h, 1];
}

/**
 * Inverts a 3×3 matrix (returned as 9-element row-major array).
 */
function invertMatrix3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, k] = m;
  const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return [...m]; // degenerate
  const inv = 1 / det;
  return [
    (e * k - f * h) * inv, (c * h - b * k) * inv, (b * f - c * e) * inv,
    (f * g - d * k) * inv, (a * k - c * g) * inv, (c * d - a * f) * inv,
    (d * h - e * g) * inv, (b * g - a * h) * inv, (a * e - b * d) * inv,
  ];
}

/**
 * Applies homography matrix H to point p. Returns transformed point.
 */
function applyH(H: number[], p: Point): Point {
  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = H;
  const w = h6 * p.x + h7 * p.y + h8;
  return {
    x: (h0 * p.x + h1 * p.y + h2) / w,
    y: (h3 * p.x + h4 * p.y + h5) / w,
  };
}

/**
 * Perspective-corrects the source canvas using 4 detected corner points.
 * Returns a new canvas with dimensions PAGE_W × PAGE_H (595 × 842 px).
 * After this operation, 1 pixel = 1 PDF point.
 */
export function perspectiveCorrect(
  srcCanvas: HTMLCanvasElement,
  corners: CornerSet
): HTMLCanvasElement {
  const DW = OMR.PAGE_W;
  const DH = OMR.PAGE_H;

  // Destination corners = centers of the corner markers in PDF space
  const dstCorners: Point[] = [
    OMR.CM_TL_C as Point,
    OMR.CM_TR_C as Point,
    OMR.CM_BL_C as Point,
    OMR.CM_BR_C as Point,
  ];
  const [tl, tr, bl, br] = corners;
  const srcCorners: Point[] = [tl, tr, bl, br];

  // H maps destination → source (we iterate over destination pixels)
  const H_dst_to_src = computeHomography(dstCorners, srcCorners);

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = DW;
  dstCanvas.height = DH;
  const dstCtx = dstCanvas.getContext('2d')!;

  const srcCtx = srcCanvas.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;
  const SW = srcCanvas.width;
  const SH = srcCanvas.height;

  const dstData = dstCtx.createImageData(DW, DH);

  for (let dy = 0; dy < DH; dy++) {
    for (let dx = 0; dx < DW; dx++) {
      const src = applyH(H_dst_to_src, { x: dx, y: dy });
      const sx = Math.round(src.x);
      const sy = Math.round(src.y);
      if (sx < 0 || sx >= SW || sy < 0 || sy >= SH) continue;

      const si = (sy * SW + sx) * 4;
      const di = (dy * DW + dx) * 4;
      dstData.data[di]     = srcData[si];
      dstData.data[di + 1] = srcData[si + 1];
      dstData.data[di + 2] = srcData[si + 2];
      dstData.data[di + 3] = 255;
    }
  }

  dstCtx.putImageData(dstData, 0, 0);
  return dstCanvas;
}

// ─── 4. Bubble Detection ──────────────────────────────────────────────────────

/**
 * Samples a circular region around (cx, cy) with radius r in the canvas.
 * Returns the fraction of pixels that are "dark" (< threshold grayscale).
 */
function sampleBubbleFill(
  data: Uint8ClampedArray,
  W: number,
  cx: number,
  cy: number,
  r: number,
  darkThreshold = 140
): number {
  let dark = 0, total = 0;
  const rInt = Math.ceil(r);
  for (let dy = -rInt; dy <= rInt; dy++) {
    for (let dx = -rInt; dx <= rInt; dx++) {
      if (dx * dx + dy * dy > r * r) continue; // outside circle
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px < 0 || py < 0 || px >= W) continue;
      const i = (py * W + px) * 4;
      const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (g < darkThreshold) dark++;
      total++;
    }
  }
  return total === 0 ? 0 : dark / total;
}

/**
 * Detects which bubbles are filled in the corrected canvas.
 * @param correctedCanvas  Output of perspectiveCorrect() — 595×842px
 * @param totalItems       How many items to read
 * @param numChoices       Number of choices per item (A=1, B=2, ...)
 */
export function detectBubbles(
  correctedCanvas: HTMLCanvasElement,
  totalItems: number,
  numChoices: number
): { answers: { [item: number]: string | null }; confidence: { [item: number]: { [ch: string]: number } } } {
  const ctx = correctedCanvas.getContext('2d')!;
  const data = ctx.getImageData(0, 0, correctedCanvas.width, correctedCanvas.height).data;
  const W = correctedCanvas.width;
  const choices = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, numChoices);

  const answers: { [item: number]: string | null } = {};
  const confidence: { [item: number]: { [ch: string]: number } } = {};

  for (let item = 1; item <= totalItems; item++) {
    const fills: { ch: string; fill: number }[] = [];

    choices.forEach((ch, ci) => {
      const center = OMR.bubbleCenter(item, ci);
      const fill = sampleBubbleFill(data, W, center.x, center.y, OMR.BUBBLE_R + 1);
      fills.push({ ch, fill });
    });

    // Confidence map
    confidence[item] = {};
    fills.forEach(({ ch, fill }) => { confidence[item][ch] = fill; });

    // Determine filled bubble: must exceed threshold AND be notably higher than others
    const maxFill = Math.max(...fills.map(f => f.fill));
    const filled = fills.filter(f => f.fill >= OMR.FILL_THRESHOLD && f.fill >= maxFill * 0.8);

    answers[item] = filled.length === 1 ? filled[0].ch : null;
  }

  return { answers, confidence };
}

// ─── 5. QR Code Reader ────────────────────────────────────────────────────────

/**
 * Attempts to read the exam ID from the QR code region using
 * the browser's BarcodeDetector API (supported in Chrome/Edge/Safari 17+).
 * Returns the exam ID number, or null if not detectable.
 */
export async function readExamIdFromQr(canvas: HTMLCanvasElement): Promise<number | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BD = (window as any).BarcodeDetector;
  if (!BD) return null;

  try {
    const detector = new BD({ formats: ['qr_code'] });
    const barcodes = await detector.detect(canvas);
    for (const b of barcodes) {
      const match = (b.rawValue as string).match(/^EXAM:(\d+)$/);
      if (match) return parseInt(match[1]);
    }
  } catch { /* not supported */ }
  return null;
}

// ─── Full Pipeline ─────────────────────────────────────────────────────────────

/**
 * Runs the full OMR pipeline on a captured image file.
 * @param file        The photo of the answer sheet
 * @param totalItems  Number of items on the exam
 * @param numChoices  Choices per item
 * @param manualCorners  Optional manually provided corners (overrides auto detection)
 */
export async function processAnswerSheet(
  file: File | Blob,
  totalItems: number,
  numChoices: number,
  manualCorners?: CornerSet
): Promise<DetectionResult> {
  const srcCanvas = await loadImageToCanvas(file);

  let corners = manualCorners ?? detectCornerMarkers(srcCanvas);
  const autoDetected = !manualCorners && corners !== null;

  if (!corners) {
    // Fallback: assume the image IS the answer sheet (no perspective correction needed)
    // Scale the canvas to match canonical dimensions
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = OMR.PAGE_W;
    fallbackCanvas.height = OMR.PAGE_H;
    const fCtx = fallbackCanvas.getContext('2d')!;
    fCtx.drawImage(srcCanvas, 0, 0, OMR.PAGE_W, OMR.PAGE_H);

    const { answers, confidence } = detectBubbles(fallbackCanvas, totalItems, numChoices);
    const W = srcCanvas.width, H = srcCanvas.height;
    return {
      answers, confidence, cornersAutoDetected: false,
      corners: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: 0, y: H }, { x: W, y: H }],
    };
  }

  const corrected = perspectiveCorrect(srcCanvas, corners);
  const { answers, confidence } = detectBubbles(corrected, totalItems, numChoices);

  return { answers, confidence, cornersAutoDetected: autoDetected, corners };
}
