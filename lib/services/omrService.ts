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
  const isDark = (i: number) => gray(i) < 95;

  /**
   * Search a rectangular region and return the center of the largest dark connected component.
   * This avoids averaging unrelated dark pixels (text/shadows) into the corner estimate.
   */
  function findLargestBlobCenter(rx: number, ry: number, rw: number, rh: number): Point | null {
    const visited = new Uint8Array(rw * rh);
    const idxLocal = (lx: number, ly: number) => ly * rw + lx;

    let bestArea = 0;
    let bestCenter: Point | null = null;

    for (let ly = 0; ly < rh; ly++) {
      for (let lx = 0; lx < rw; lx++) {
        const start = idxLocal(lx, ly);
        if (visited[start]) continue;
        visited[start] = 1;

        const gx = rx + lx;
        const gy = ry + ly;
        if (!isDark(gy * W + gx)) continue;

        const qx: number[] = [lx];
        const qy: number[] = [ly];
        let head = 0;

        let area = 0;
        let minX = lx, maxX = lx, minY = ly, maxY = ly;

        while (head < qx.length) {
          const cx = qx[head];
          const cy = qy[head];
          head++;

          area++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              if (ox === 0 && oy === 0) continue;
              const nx = cx + ox;
              const ny = cy + oy;
              if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue;
              const nIdx = idxLocal(nx, ny);
              if (visited[nIdx]) continue;
              visited[nIdx] = 1;
              const ngx = rx + nx;
              const ngy = ry + ny;
              if (isDark(ngy * W + ngx)) {
                qx.push(nx);
                qy.push(ny);
              }
            }
          }
        }

        if (area < 40) continue;
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const aspect = bw > bh ? bw / bh : bh / bw;
        const density = area / (bw * bh);

        // Corner markers are compact near-square dense blobs.
        if (aspect > 2.1 || density < 0.28) continue;
        if (area > bestArea) {
          bestArea = area;
          bestCenter = {
            x: Math.round(rx + (minX + maxX) / 2),
            y: Math.round(ry + (minY + maxY) / 2),
          };
        }
      }
    }

    return bestCenter;
  }

  // Each corner region is 20% × 20% of the image
  const cw = Math.round(W * 0.20);
  const ch = Math.round(H * 0.20);

  const tl = findLargestBlobCenter(0, 0, cw, ch);
  const tr = findLargestBlobCenter(W - cw, 0, cw, ch);
  const bl = findLargestBlobCenter(0, H - ch, cw, ch);
  const br = findLargestBlobCenter(W - cw, H - ch, cw, ch);

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
      const di = (dy * DW + dx) * 4;
      const sx = src.x;
      const sy = src.y;
      if (sx < 0 || sx >= SW - 1 || sy < 0 || sy >= SH - 1) continue;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const tx = sx - x0;
      const ty = sy - y0;

      const i00 = (y0 * SW + x0) * 4;
      const i10 = (y0 * SW + x1) * 4;
      const i01 = (y1 * SW + x0) * 4;
      const i11 = (y1 * SW + x1) * 4;

      // Bilinear interpolation retains mark detail better than nearest-neighbor.
      for (let c = 0; c < 3; c++) {
        const v00 = srcData[i00 + c];
        const v10 = srcData[i10 + c];
        const v01 = srcData[i01 + c];
        const v11 = srcData[i11 + c];
        const v0 = v00 * (1 - tx) + v10 * tx;
        const v1 = v01 * (1 - tx) + v11 * tx;
        dstData.data[di + c] = Math.round(v0 * (1 - ty) + v1 * ty);
      }
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
  H: number,
  cx: number,
  cy: number,
  r: number
): number {
  const innerR = r * 0.62;
  const bgInnerR = r * 1.2;
  const bgOuterR = r * 1.9;
  const rInt = Math.ceil(bgOuterR);

  let innerDark = 0;
  let innerTotal = 0;
  let innerGraySum = 0;
  let bgGraySum = 0;
  let bgTotal = 0;

  for (let dy = -rInt; dy <= rInt; dy++) {
    for (let dx = -rInt; dx <= rInt; dx++) {
      const d2 = dx * dx + dy * dy;
      const dist = Math.sqrt(d2);
      if (dist > bgOuterR) continue;
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = (py * W + px) * 4;
      const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

      if (dist <= innerR) {
        innerGraySum += g;
        innerTotal++;
      } else if (dist >= bgInnerR) {
        bgGraySum += g;
        bgTotal++;
      }
    }
  }

  if (innerTotal === 0 || bgTotal === 0) return 0;

  const innerMean = innerGraySum / innerTotal;
  const bgMean = bgGraySum / bgTotal;
  const localDarkThreshold = Math.max(55, Math.min(200, bgMean - 20));

  for (let dy = -Math.ceil(innerR); dy <= Math.ceil(innerR); dy++) {
    for (let dx = -Math.ceil(innerR); dx <= Math.ceil(innerR); dx++) {
      if (dx * dx + dy * dy > innerR * innerR) continue;
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = (py * W + px) * 4;
      const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (g < localDarkThreshold) innerDark++;
    }
  }

  const fillRatio = innerDark / innerTotal;
  const meanDrop = Math.max(0, bgMean - innerMean);
  const meanDropScore = Math.min(1, meanDrop / 85);
  return fillRatio * 0.7 + meanDropScore * 0.3;
}

/**
 * Quick focus metric (Tenengrad-style) on luminance gradients.
 * Lower values indicate blur, motion blur, or strong defocus.
 */
function estimateSharpness(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d')!;
  const { width: W, height: H } = canvas;
  const data = ctx.getImageData(0, 0, W, H).data;
  const stride = Math.max(1, Math.floor(Math.min(W, H) / 900));

  let sum = 0;
  let count = 0;

  const lum = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  };

  for (let y = stride; y < H - stride; y += stride) {
    for (let x = stride; x < W - stride; x += stride) {
      const gx = lum(x + stride, y) - lum(x - stride, y);
      const gy = lum(x, y + stride) - lum(x, y - stride);
      sum += gx * gx + gy * gy;
      count++;
    }
  }

  return count ? sum / count : 0;
}

function sampleBubbleFillBestOffset(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  cx: number,
  cy: number,
  r: number
): number {
  let best = 0;
  // Small local search to absorb minor geometric drift after homography.
  for (let oy = -2; oy <= 2; oy++) {
    for (let ox = -2; ox <= 2; ox++) {
      const score = sampleBubbleFill(data, W, H, cx + ox, cy + oy, r);
      if (score > best) best = score;
    }
  }
  return best;
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
  const H = correctedCanvas.height;
  const choices = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, numChoices);

  const answers: { [item: number]: string | null } = {};
  const confidence: { [item: number]: { [ch: string]: number } } = {};

  for (let item = 1; item <= totalItems; item++) {
    const fills: { ch: string; fill: number }[] = [];

    choices.forEach((ch, ci) => {
      const center = OMR.bubbleCenter(item, ci);
      const fill = sampleBubbleFillBestOffset(data, W, H, center.x, center.y, OMR.BUBBLE_R + 1);
      fills.push({ ch, fill });
    });

    // Confidence map
    confidence[item] = {};
    fills.forEach(({ ch, fill }) => { confidence[item][ch] = fill; });

    // Determine filled bubble using threshold + separation from second best.
    const sorted = [...fills].sort((a, b) => b.fill - a.fill);
    const top = sorted[0];
    const second = sorted[1];
    const topScore = top?.fill ?? 0;
    const secondScore = second?.fill ?? 0;
    const delta = topScore - secondScore;

    const isMarked = topScore >= Math.max(OMR.FILL_THRESHOLD, 0.22);
    const ambiguousPair = secondScore >= 0.2 && delta < 0.08;
    const lowSeparation = delta < 0.05;

    answers[item] = isMarked && !ambiguousPair && !lowSeparation ? top.ch : null;
  }

  return { answers, confidence };
}

function detectionQuality(
  answers: { [item: number]: string | null },
  confidence: { [item: number]: { [choice: string]: number } }
): number {
  let score = 0;
  let items = 0;

  for (const itemKey of Object.keys(confidence)) {
    const item = Number(itemKey);
    const values = Object.values(confidence[item] ?? {}).sort((a, b) => b - a);
    if (!values.length) continue;

    const top = values[0] ?? 0;
    const second = values[1] ?? 0;
    const delta = top - second;

    // Favor strong/clear marks and penalize weak/ambiguous patterns.
    score += top * 1.4 + delta * 2.2;
    if (answers[item]) score += 0.15;
    if (top < 0.18) score -= 0.2;
    if (delta < 0.04) score -= 0.15;
    items++;
  }

  return items ? score / items : -1e9;
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
  const sharpness = estimateSharpness(srcCanvas);
  if (sharpness < 130) {
    throw new Error('Image appears blurry. Use better lighting, keep camera steady, and recapture.');
  }

  const corners = manualCorners ?? detectCornerMarkers(srcCanvas);
  const autoDetected = !manualCorners && corners !== null;

  if (!corners) {
    throw new Error('Could not detect all corner markers. Recapture with full sheet visible and better lighting.');
  }

  if (manualCorners) {
    const corrected = perspectiveCorrect(srcCanvas, corners);
    const { answers, confidence } = detectBubbles(corrected, totalItems, numChoices);
    return { answers, confidence, cornersAutoDetected: autoDetected, corners };
  }

  // Try rotated/mirrored corner orderings and keep the most plausible read.
  const [tl, tr, bl, br] = corners;
  const candidates: CornerSet[] = [
    [tl, tr, bl, br], // normal
    [br, bl, tr, tl], // rotate 180
    [tr, br, tl, bl], // rotate 90 CW
    [bl, tl, br, tr], // rotate 90 CCW
    [tr, tl, br, bl], // mirror horizontal
    [bl, br, tl, tr], // mirror vertical
    [tl, bl, tr, br], // transpose-like variant
    [br, tr, bl, tl], // anti-transpose-like variant
  ];

  let best: {
    quality: number;
    corners: CornerSet;
    answers: { [item: number]: string | null };
    confidence: { [item: number]: { [choice: string]: number } };
  } | null = null;

  for (const cand of candidates) {
    const corrected = perspectiveCorrect(srcCanvas, cand);
    const { answers, confidence } = detectBubbles(corrected, totalItems, numChoices);
    const quality = detectionQuality(answers, confidence);

    if (!best || quality > best.quality) {
      best = { quality, corners: cand, answers, confidence };
    }
  }

  if (!best) {
    throw new Error('Failed to evaluate scan orientation. Please recapture.');
  }

  return {
    answers: best.answers,
    confidence: best.confidence,
    cornersAutoDetected: autoDetected,
    corners: best.corners,
  };
}
