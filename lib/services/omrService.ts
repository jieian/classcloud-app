/**
 * omrService.ts
 *
 * Browser-based OMR engine powered by OpenCV.js.
 *
 * Pipeline:
 *  1. loadImageToCanvas()   — Load a File/Blob onto a canvas
 *  2. detectCorners()       — Find the 4 black corner squares via findContours
 *  3. warpPerspective()     — cv.warpPerspective to canonical PAGE_W × PAGE_H
 *  4. detectBubbles()       — cv.adaptiveThreshold + pixel count per bubble
 *  5. readExamId()          — BarcodeDetector QR read
 *
 * All coordinates use OMR constants so they stay in sync with the PDF layout.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any;

import { OMR } from '@/lib/omrLayout';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Point { x: number; y: number; }

export interface DetectionResult {
  answers: { [item: number]: string | null };
  confidence: { [item: number]: { [choice: string]: number } };
  cornersAutoDetected: boolean;
  corners: [Point, Point, Point, Point];
  /** Debug image data URL: corrected + binarized canvas with bubble circles */
  debugDataUrl: string;
}

export type CornerSet = [Point, Point, Point, Point]; // TL, TR, BL, BR

// ─── OpenCV loader ────────────────────────────────────────────────────────────

let _cvPromise: Promise<CV> | null = null;

function loadCV(): Promise<CV> {
  if (!_cvPromise) {
    _cvPromise = import('@techstark/opencv-js').then((mod) => {
      const cv: CV = mod.default ?? mod;
      if (cv.Mat !== undefined) return cv;
      return new Promise<CV>((resolve) => { cv.onRuntimeInitialized = () => resolve(cv); });
    });
  }
  return _cvPromise;
}

// ─── Canvas ↔ Mat helpers ────────────────────────────────────────────────────

function canvasToMat(cv: CV, canvas: HTMLCanvasElement): CV {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return cv.matFromImageData(imageData);
}

function matToCanvas(cv: CV, mat: CV, canvas: HTMLCanvasElement): void {
  canvas.width = mat.cols;
  canvas.height = mat.rows;
  const ctx = canvas.getContext('2d')!;
  // mat may be grayscale (CV_8UC1) or RGBA (CV_8UC4)
  let rgba: CV;
  if (mat.channels() === 1) {
    rgba = new cv.Mat();
    cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
  } else if (mat.channels() === 3) {
    rgba = new cv.Mat();
    cv.cvtColor(mat, rgba, cv.COLOR_RGB2RGBA);
  } else {
    rgba = mat.clone();
  }
  const imageData = new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows);
  ctx.putImageData(imageData, 0, 0);
  if (rgba !== mat) rgba.delete();
}

// ─── 1. Load image ─────────────────────────────────────────────────────────

export function loadImageToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── 2. Corner detection ─────────────────────────────────────────────────────

/**
 * Detects the 4 black corner squares using cv.findContours.
 * Searches each 20%×20% quadrant for the largest square-ish dark blob.
 */
function detectCorners(cv: CV, src: CV): CornerSet | null {
  const W = src.cols;
  const H = src.rows;

  // Grayscale → binary (dark → white in inverted image)
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  const binary = new cv.Mat();
  cv.threshold(gray, binary, 80, 255, cv.THRESH_BINARY_INV);
  gray.delete();

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  binary.delete();
  hierarchy.delete();

  function bestInRegion(rx: number, ry: number, rw: number, rh: number): Point | null {
    let bestArea = 0;
    let best: Point | null = null;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < 40) continue;

      const rect = cv.boundingRect(cnt);
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      if (cx < rx || cx > rx + rw || cy < ry || cy > ry + rh) continue;

      const aspect = rect.width / Math.max(1, rect.height);
      if (aspect < 0.35 || aspect > 2.8) continue;

      if (area > bestArea) {
        bestArea = area;
        best = { x: Math.round(cx), y: Math.round(cy) };
      }
    }
    return best;
  }

  const cw = Math.round(W * 0.22);
  const ch = Math.round(H * 0.22);

  const tl = bestInRegion(0,     0,     cw, ch);
  const tr = bestInRegion(W-cw,  0,     cw, ch);
  const bl = bestInRegion(0,     H-ch,  cw, ch);
  const br = bestInRegion(W-cw,  H-ch,  cw, ch);

  contours.delete();

  if (!tl || !tr || !bl || !br) return null;
  return [tl, tr, bl, br];
}

// ─── 3. Perspective correction ───────────────────────────────────────────────

/**
 * Uses cv.getPerspectiveTransform + cv.warpPerspective to map
 * the 4 detected corners to the canonical PDF-point positions.
 * Returns a new Mat (RGBA, PAGE_W × PAGE_H).
 */
function warpToPage(cv: CV, src: CV, corners: CornerSet): CV {
  const [tl, tr, bl, br] = corners;

  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y,
    tr.x, tr.y,
    bl.x, bl.y,
    br.x, br.y,
  ]);
  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    OMR.CM_TL_C.x, OMR.CM_TL_C.y,
    OMR.CM_TR_C.x, OMR.CM_TR_C.y,
    OMR.CM_BL_C.x, OMR.CM_BL_C.y,
    OMR.CM_BR_C.x, OMR.CM_BR_C.y,
  ]);

  const M = cv.getPerspectiveTransform(srcPts, dstPts);
  const dst = new cv.Mat();
  const dsize = new cv.Size(OMR.PAGE_W, OMR.PAGE_H);
  cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

  srcPts.delete(); dstPts.delete(); M.delete();
  return dst;
}

// ─── 4. Bubble detection ─────────────────────────────────────────────────────

/**
 * Returns the fill ratio (0–1) of a bubble circle using a pre-computed binary Mat.
 * binary: CV_8UC1 where 255 = ink (THRESH_BINARY_INV), 0 = paper.
 */
function sampleFill(binaryData: Uint8Array, W: number, H: number, cx: number, cy: number, r: number): number {
  const innerR = r * 0.72;
  const rInt = Math.ceil(innerR);
  let ink = 0, total = 0;

  for (let dy = -rInt; dy <= rInt; dy++) {
    for (let dx = -rInt; dx <= rInt; dx++) {
      if (dx * dx + dy * dy > innerR * innerR) continue;
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      if (binaryData[py * W + px] === 255) ink++;
      total++;
    }
  }
  return total === 0 ? 0 : ink / total;
}

/**
 * Binarizes the corrected page and counts ink pixels in each bubble circle.
 * Uses cv.adaptiveThreshold (ADAPTIVE_THRESH_MEAN_C, THRESH_BINARY_INV):
 *   - pixel darker than local neighbourhood mean − C → 255 (ink)
 *   - pixel lighter → 0 (paper)
 */
export function detectBubbles(
  cv: CV,
  correctedMat: CV,
  totalItems: number,
  numChoices: number
): { answers: { [item: number]: string | null }; confidence: { [item: number]: { [ch: string]: number } }; binaryMat: CV } {
  const gray = new cv.Mat();
  cv.cvtColor(correctedMat, gray, cv.COLOR_RGBA2GRAY);

  const binary = new cv.Mat();
  cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 11, 8);
  gray.delete();

  const binaryData: Uint8Array = binary.data;
  const W = binary.cols;
  const H = binary.rows;

  const choices = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, numChoices);
  const answers: { [item: number]: string | null } = {};
  const confidence: { [item: number]: { [ch: string]: number } } = {};

  for (let item = 1; item <= totalItems; item++) {
    const fills = choices.map((ch, ci) => {
      const center = OMR.bubbleCenter(item, ci, totalItems);
      return { ch, fill: sampleFill(binaryData, W, H, center.x, center.y, OMR.BUBBLE_R) };
    });

    const sorted = [...fills].sort((a, b) => b.fill - a.fill);
    const topFill = sorted[0].fill;
    const delta   = topFill - sorted[1].fill;

    // Marked if ≥20% ink pixels AND clearly ahead of 2nd place by ≥10pp
    const isMarked = topFill >= 0.20 && delta >= 0.10;
    answers[item] = isMarked ? sorted[0].ch : null;

    confidence[item] = {};
    fills.forEach(({ ch, fill }) => { confidence[item][ch] = fill; });
  }

  return { answers, confidence, binaryMat: binary };
}

// ─── Debug overlay ────────────────────────────────────────────────────────────

function buildDebugDataUrl(
  cv: CV,
  binaryMat: CV,
  answers: { [item: number]: string | null },
  confidence: { [item: number]: { [choice: string]: number } },
  totalItems: number,
  numChoices: number
): string {
  // Draw binary image on canvas then overlay circles
  const canvas = document.createElement('canvas');
  matToCanvas(cv, binaryMat, canvas);
  const ctx = canvas.getContext('2d')!;

  const choices = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, numChoices);
  const r = OMR.BUBBLE_R * 0.72;

  for (let item = 1; item <= totalItems; item++) {
    choices.forEach((ch, ci) => {
      const center = OMR.bubbleCenter(item, ci, totalItems);
      const isMarked = answers[item] === ch;
      const pct = Math.round((confidence[item]?.[ch] ?? 0) * 100);

      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = isMarked ? '#00ff00' : '#ff4444';
      ctx.lineWidth = isMarked ? 2 : 1;
      ctx.stroke();

      ctx.fillStyle = isMarked ? '#00cc00' : '#ff4444';
      ctx.font = `bold ${Math.round(r * 0.9)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(pct), center.x, center.y);
    });
  }

  return canvas.toDataURL('image/jpeg', 0.85);
}

// ─── Orientation scoring ──────────────────────────────────────────────────────

function detectionQuality(
  answers: { [item: number]: string | null },
  confidence: { [item: number]: { [choice: string]: number } }
): number {
  let score = 0, items = 0;
  for (const itemKey of Object.keys(confidence)) {
    const item = Number(itemKey);
    const values = Object.values(confidence[item] ?? {}).sort((a, b) => b - a);
    if (!values.length) continue;
    const top = values[0] ?? 0;
    const second = values[1] ?? 0;
    const delta = top - second;
    score += top * 1.4 + delta * 2.2;
    if (answers[item]) score += 0.15;
    if (top < 0.18) score -= 0.2;
    if (delta < 0.04) score -= 0.15;
    items++;
  }
  return items ? score / items : -1e9;
}

// ─── 5. QR Code reader ────────────────────────────────────────────────────────

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

// ─── Sharpness check ──────────────────────────────────────────────────────────

function estimateSharpness(cv: CV, src: CV): number {
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  const laplacian = new cv.Mat();
  cv.Laplacian(gray, laplacian, cv.CV_64F);
  const mean = new cv.Mat();
  const stddev = new cv.Mat();
  cv.meanStdDev(laplacian, mean, stddev);
  const variance = stddev.doubleAt(0, 0) ** 2;
  gray.delete(); laplacian.delete(); mean.delete(); stddev.delete();
  return variance;
}

// ─── Full pipeline ────────────────────────────────────────────────────────────

export async function processAnswerSheet(
  file: File | Blob,
  totalItems: number,
  numChoices: number,
  manualCorners?: CornerSet
): Promise<DetectionResult> {
  const cv = await loadCV();

  // Load image
  const srcCanvas = document.createElement('canvas');
  await new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      srcCanvas.width = img.naturalWidth;
      srcCanvas.height = img.naturalHeight;
      srcCanvas.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });

  const srcMat = canvasToMat(cv, srcCanvas);

  // Sharpness check
  const sharpness = estimateSharpness(cv, srcMat);
  if (sharpness < 50) {
    srcMat.delete();
    throw new Error('Image appears blurry. Use better lighting, keep camera steady, and recapture.');
  }

  // Corner detection
  const corners = manualCorners ?? detectCorners(cv, srcMat);
  const autoDetected = !manualCorners && corners !== null;

  if (!corners) {
    srcMat.delete();
    throw new Error('Could not detect all corner markers. Ensure all 4 corners are visible and well-lit.');
  }

  if (manualCorners) {
    const corrected = warpToPage(cv, srcMat, corners);
    srcMat.delete();
    const { answers, confidence, binaryMat } = detectBubbles(cv, corrected, totalItems, numChoices);
    const debugDataUrl = buildDebugDataUrl(cv, binaryMat, answers, confidence, totalItems, numChoices);
    binaryMat.delete(); corrected.delete();
    return { answers, confidence, cornersAutoDetected: autoDetected, corners, debugDataUrl };
  }

  // Try all 8 orientations, keep the best-scoring one
  const [tl, tr, bl, br] = corners;
  const candidates: CornerSet[] = [
    [tl, tr, bl, br],
    [br, bl, tr, tl],
    [tr, br, tl, bl],
    [bl, tl, br, tr],
    [tr, tl, br, bl],
    [bl, br, tl, tr],
    [tl, bl, tr, br],
    [br, tr, bl, tl],
  ];

  let best: {
    quality: number;
    corners: CornerSet;
    answers: { [item: number]: string | null };
    confidence: { [item: number]: { [choice: string]: number } };
    corrected: CV;
    binaryMat: CV;
  } | null = null;

  for (const cand of candidates) {
    const corrected = warpToPage(cv, srcMat, cand);
    const { answers, confidence, binaryMat } = detectBubbles(cv, corrected, totalItems, numChoices);
    const quality = detectionQuality(answers, confidence);

    if (!best || quality > best.quality) {
      if (best) { best.corrected.delete(); best.binaryMat.delete(); }
      best = { quality, corners: cand, answers, confidence, corrected, binaryMat };
    } else {
      corrected.delete(); binaryMat.delete();
    }
  }

  srcMat.delete();

  if (!best) throw new Error('Failed to evaluate scan orientation. Please recapture.');

  const debugDataUrl = buildDebugDataUrl(cv, best.binaryMat, best.answers, best.confidence, totalItems, numChoices);
  best.corrected.delete();
  best.binaryMat.delete();

  return {
    answers: best.answers,
    confidence: best.confidence,
    cornersAutoDetected: autoDetected,
    corners: best.corners,
    debugDataUrl,
  };
}
