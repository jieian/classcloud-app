/**
 * omrService.ts — Pure JS OMR engine, no external dependencies.
 *
 * Pipeline:
 *  1. loadImageToCanvas()  — load a File/Blob onto an HTML canvas
 *  2. detectCorners()      — find the 4 black corner squares via density scan
 *  3. warpToPage()         — perspective-correct to PAGE_W × PAGE_H
 *  4. detectBubbles()      — gray-mean relative comparison per row
 */

import { OMR } from '@/lib/omrLayout';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Point { x: number; y: number; }

export interface DetectionResult {
  answers:    { [item: number]: string | null };
  confidence: { [item: number]: { [choice: string]: number } };
  cornersAutoDetected: boolean;
  corners: [Point, Point, Point, Point];
  debugDataUrl: string;
}

export type CornerSet = [Point, Point, Point, Point];

// ─── Constants ────────────────────────────────────────────────────────────────

const WARP_SCALE  = 2;
const MAX_SCAN_PX = 1500;

// ─── 0. Pre-scaler ────────────────────────────────────────────────────────────

function scaleCanvas(src: HTMLCanvasElement, maxPx: number): HTMLCanvasElement {
  const longest = Math.max(src.width, src.height);
  if (longest <= maxPx) return src;
  const s = maxPx / longest;
  const dst = document.createElement('canvas');
  dst.width  = Math.round(src.width  * s);
  dst.height = Math.round(src.height * s);
  dst.getContext('2d')!.drawImage(src, 0, 0, dst.width, dst.height);
  return dst;
}

// ─── 1. Load image ────────────────────────────────────────────────────────────

export function loadImageToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── 2. Corner detection ──────────────────────────────────────────────────────

function canvasToGray(canvas: HTMLCanvasElement): { gray: Uint8Array; W: number; H: number } {
  const W = canvas.width, H = canvas.height;
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, W, H);
  const gray = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    gray[i] = (77 * data[i * 4] + 150 * data[i * 4 + 1] + 29 * data[i * 4 + 2]) >> 8;
  }
  return { gray, W, H };
}

function detectCorners(canvas: HTMLCanvasElement): CornerSet | null {
  const { gray, W, H } = canvasToGray(canvas);
  const DARK = 80;
  const IW = W + 1;
  const integral = new Int32Array(IW * (H + 1));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = gray[y * W + x] < DARK ? 1 : 0;
      integral[(y + 1) * IW + (x + 1)] =
        d + integral[y * IW + (x + 1)] + integral[(y + 1) * IW + x] - integral[y * IW + x];
    }
  }

  function darkDensity(x1: number, y1: number, x2: number, y2: number): number {
    const n = integral[(y2 + 1) * IW + (x2 + 1)]
            - integral[y1       * IW + (x2 + 1)]
            - integral[(y2 + 1) * IW + x1]
            + integral[y1       * IW + x1];
    return n / ((x2 - x1 + 1) * (y2 - y1 + 1));
  }

  const scaleEst = W / OMR.PAGE_W;
  const szMin    = Math.max(4, Math.round(OMR.CM_SIZE * scaleEst * 0.4));
  const szMax    = Math.round(OMR.CM_SIZE * scaleEst * 2.2);
  const szStep   = Math.max(1, Math.round(OMR.CM_SIZE * scaleEst * 0.15));
  const scanStep = Math.max(1, Math.round(scaleEst * 2.5));

  function findMarker(rx: number, ry: number, rw: number, rh: number): Point | null {
    const DENSITY_MIN = 0.55;
    let bestDensity = DENSITY_MIN, bestCx = -1, bestCy = -1, bestSz = -1;
    const xEnd = Math.min(rx + rw, W), yEnd = Math.min(ry + rh, H);

    for (let sz = szMin; sz <= szMax; sz += szStep) {
      for (let y = ry; y + sz <= yEnd; y += scanStep) {
        for (let x = rx; x + sz <= xEnd; x += scanStep) {
          const d = darkDensity(x, y, x + sz - 1, y + sz - 1);
          if (d > bestDensity) { bestDensity = d; bestCx = x; bestCy = y; bestSz = sz; }
        }
      }
    }
    if (bestSz < 0) return null;

    const REFINE_DARK = 70;
    let sx = 0, sy = 0, n = 0;
    const x1 = Math.max(0, bestCx), x2 = Math.min(W - 1, bestCx + bestSz - 1);
    const y1 = Math.max(0, bestCy), y2 = Math.min(H - 1, bestCy + bestSz - 1);
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        if (gray[y * W + x] < REFINE_DARK) { sx += x; sy += y; n++; }
      }
    }
    if (n < 4) return { x: Math.round(bestCx + bestSz / 2), y: Math.round(bestCy + bestSz / 2) };
    return { x: Math.round(sx / n), y: Math.round(sy / n) };
  }

  const cw   = Math.round(W * 0.30);
  const ch   = Math.round(H * 0.30);
  const cwTR = Math.round(W * 0.15);

  const tl = findMarker(0,        0,      cw,   ch);
  const tr = findMarker(W - cwTR, 0,      cwTR, ch);
  const bl = findMarker(0,        H - ch, cw,   ch);
  const br = findMarker(W - cw,   H - ch, cw,   ch);

  if (!tl || !tr || !bl || !br) return null;
  return [tl, tr, bl, br];
}

// ─── 3. Perspective correction ────────────────────────────────────────────────

function solve(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxR = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[maxR][col])) maxR = r;
    }
    [M[col], M[maxR]] = [M[maxR], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) return null;
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
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

function computeHomography(src: Point[], dst: Point[]): number[] | null {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i], { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]); b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]); b.push(dy);
  }
  const h = solve(A, b);
  return h ? [...h, 1] : null;
}

function invert3x3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, k] = m;
  const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return [
    (e*k - f*h)*inv, (c*h - b*k)*inv, (b*f - c*e)*inv,
    (f*g - d*k)*inv, (a*k - c*g)*inv, (c*d - a*f)*inv,
    (d*h - e*g)*inv, (b*g - a*h)*inv, (a*e - b*d)*inv,
  ];
}

function warpToPage(srcCanvas: HTMLCanvasElement, corners: CornerSet): HTMLCanvasElement {
  const [tl, tr, bl, br] = corners;
  const S = WARP_SCALE;
  const dstPts = [OMR.CM_TL_C, OMR.CM_TR_C, OMR.CM_BL_C, OMR.CM_BR_C]
    .map(p => ({ x: p.x * S, y: p.y * S }));

  const H = computeHomography([tl, tr, bl, br], dstPts);
  if (!H) throw new Error('Homography failed.');
  const Hinv = invert3x3(H);
  if (!Hinv) throw new Error('Homography singular.');

  const PW = OMR.PAGE_W * S, PH = OMR.PAGE_H * S;
  const SW = srcCanvas.width, SH = srcCanvas.height;
  const srcData = srcCanvas.getContext('2d')!.getImageData(0, 0, SW, SH).data;

  const dst = document.createElement('canvas');
  dst.width = PW; dst.height = PH;
  const dstCtx = dst.getContext('2d')!;
  const dstImg = dstCtx.createImageData(PW, PH);
  const dstD = dstImg.data;

  for (let dy = 0; dy < PH; dy++) {
    for (let dx = 0; dx < PW; dx++) {
      const w  = Hinv[6]*dx + Hinv[7]*dy + Hinv[8];
      const sx = (Hinv[0]*dx + Hinv[1]*dy + Hinv[2]) / w;
      const sy = (Hinv[3]*dx + Hinv[4]*dy + Hinv[5]) / w;
      const di = (dy * PW + dx) * 4;
      const sxi = sx | 0, syi = sy | 0;
      if (sxi < 0 || syi < 0 || sxi >= SW - 1 || syi >= SH - 1) {
        dstD[di] = dstD[di+1] = dstD[di+2] = 255; dstD[di+3] = 255; continue;
      }
      const fx = sx - sxi, fy = sy - syi;
      const i00 = (syi*SW + sxi)*4, i10 = i00+4, i01 = i00+SW*4, i11 = i01+4;
      for (let c = 0; c < 3; c++) {
        dstD[di+c] = (srcData[i00+c]*(1-fx)*(1-fy) + srcData[i10+c]*fx*(1-fy)
                    + srcData[i01+c]*(1-fx)*fy      + srcData[i11+c]*fx*fy + 0.5) | 0;
      }
      dstD[di+3] = 255;
    }
  }
  dstCtx.putImageData(dstImg, 0, 0);
  return dst;
}

// ─── 4. Bubble detection ──────────────────────────────────────────────────────

function sampleGrayMean(
  gray: Uint8Array, W: number, H: number,
  cx: number, cy: number, r: number
): number {
  const innerR = r * 0.72, innerR2 = innerR * innerR;
  const rInt = Math.ceil(innerR);
  let sum = 0, count = 0;
  for (let dy = -rInt; dy <= rInt; dy++) {
    for (let dx = -rInt; dx <= rInt; dx++) {
      if (dx*dx + dy*dy > innerR2) continue;
      const px = Math.round(cx + dx), py = Math.round(cy + dy);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      sum += gray[py * W + px]; count++;
    }
  }
  return count > 0 ? sum / count : 255;
}

export function detectBubbles(
  correctedCanvas: HTMLCanvasElement,
  totalItems: number,
  numChoices: number
): {
  answers:    { [item: number]: string | null };
  confidence: { [item: number]: { [ch: string]: number } };
} {
  const W = correctedCanvas.width, H = correctedCanvas.height;
  const S = WARP_SCALE;
  const imgData = correctedCanvas.getContext('2d')!.getImageData(0, 0, W, H);
  const gray = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    gray[i] = (77*imgData.data[i*4] + 150*imgData.data[i*4+1] + 29*imgData.data[i*4+2]) >> 8;
  }

  const choices  = ['A','B','C','D','E','F','G','H'].slice(0, numChoices);
  const answers:    { [item: number]: string | null }             = {};
  const confidence: { [item: number]: { [ch: string]: number } } = {};
  const off = S * 2;

  for (let item = 1; item <= totalItems; item++) {
    const grayMeans = choices.map((ch, ci) => {
      const center = OMR.bubbleCenter(item, ci, totalItems);
      const cx = center.x * S, cy = center.y * S, r = OMR.BUBBLE_R * S;
      return {
        ch,
        gMean: Math.min(
          sampleGrayMean(gray, W, H, cx,     cy,     r),
          sampleGrayMean(gray, W, H, cx+off, cy,     r),
          sampleGrayMean(gray, W, H, cx-off, cy,     r),
          sampleGrayMean(gray, W, H, cx,     cy+off, r),
          sampleGrayMean(gray, W, H, cx,     cy-off, r),
        ),
      };
    });

    const bg    = Math.max(...grayMeans.map(g => g.gMean));
    const fills = grayMeans.map(({ ch, gMean }) => ({
      ch, fill: bg > 0 ? (bg - gMean) / bg : 0,
    }));
    const sorted  = [...fills].sort((a, b) => b.fill - a.fill);
    const topFill = sorted[0].fill;
    const delta   = topFill - (sorted[1]?.fill ?? 0);

    answers[item]    = (topFill >= 0.07 && delta >= 0.04) ? sorted[0].ch : null;
    confidence[item] = {};
    fills.forEach(({ ch, fill }) => { confidence[item][ch] = fill; });
  }
  return { answers, confidence };
}

// ─── 5. Debug overlay ─────────────────────────────────────────────────────────

function buildDebugDataUrl(
  correctedCanvas: HTMLCanvasElement,
  answers:    { [item: number]: string | null },
  confidence: { [item: number]: { [choice: string]: number } },
  totalItems: number,
  numChoices: number
): string {
  const canvas = document.createElement('canvas');
  canvas.width  = correctedCanvas.width;
  canvas.height = correctedCanvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(correctedCanvas, 0, 0);

  const S       = WARP_SCALE;
  const choices = ['A','B','C','D','E','F','G','H'].slice(0, numChoices);
  const r       = OMR.BUBBLE_R * S * 0.72;

  for (let item = 1; item <= totalItems; item++) {
    choices.forEach((ch, ci) => {
      const center    = OMR.bubbleCenter(item, ci, totalItems);
      const cx        = center.x * S, cy = center.y * S;
      const isMarked  = answers[item] === ch;
      const pct       = Math.round((confidence[item]?.[ch] ?? 0) * 100);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = isMarked ? '#00ff00' : '#ff4444';
      ctx.lineWidth   = isMarked ? 2 : 1;
      ctx.stroke();

      ctx.fillStyle    = isMarked ? '#00cc00' : '#ff4444';
      ctx.font         = `bold ${Math.round(r * 0.9)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(pct), cx, cy);
    });
  }
  return canvas.toDataURL('image/jpeg', 0.85);
}

// ─── 6. Quality score ─────────────────────────────────────────────────────────

function detectionQuality(
  answers:    { [item: number]: string | null },
  confidence: { [item: number]: { [choice: string]: number } }
): number {
  let score = 0, items = 0;
  for (const key of Object.keys(confidence)) {
    const item   = Number(key);
    const values = Object.values(confidence[item] ?? {}).sort((a, b) => b - a);
    if (!values.length) continue;
    const top = values[0] ?? 0, second = values[1] ?? 0;
    score += top * 1.4 + (top - second) * 2.2;
    if (answers[item])  score += 0.15;
    if (top   < 0.07)   score -= 0.20;
    if (top - second < 0.04) score -= 0.15;
    items++;
  }
  return items ? score / items : -1e9;
}

// ─── 7. QR reader ─────────────────────────────────────────────────────────────

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

// ─── 8. Main pipeline ─────────────────────────────────────────────────────────

export async function processAnswerSheet(
  file: File | Blob,
  totalItems: number,
  numChoices: number,
  manualCorners?: CornerSet
): Promise<DetectionResult> {
  const rawCanvas  = await loadImageToCanvas(file);
  const workCanvas = scaleCanvas(rawCanvas, MAX_SCAN_PX);
  const scaleRatio = workCanvas.width / rawCanvas.width;

  const rawCorners   = manualCorners ?? detectCorners(rawCanvas);
  const autoDetected = !manualCorners && rawCorners !== null;

  if (!rawCorners) {
    throw new Error(
      'Could not detect corner markers. Make sure all 4 black squares are visible and the sheet is well-lit.'
    );
  }

  const scaledCorners = rawCorners.map(c => ({
    x: c.x * scaleRatio, y: c.y * scaleRatio,
  })) as CornerSet;

  if (manualCorners) {
    const corrected = warpToPage(workCanvas, scaledCorners);
    const { answers, confidence } = detectBubbles(corrected, totalItems, numChoices);
    const debugDataUrl = buildDebugDataUrl(corrected, answers, confidence, totalItems, numChoices);
    return { answers, confidence, cornersAutoDetected: false, corners: manualCorners, debugDataUrl };
  }

  // Try 2 orientations (portrait + 180° flip)
  const [c0, c1, c2, c3] = scaledCorners;
  const candidates: CornerSet[] = [
    [c0, c1, c2, c3],
    [c3, c2, c1, c0],
  ];

  let best: {
    quality:    number;
    corners:    CornerSet;
    answers:    { [item: number]: string | null };
    confidence: { [item: number]: { [ch: string]: number } };
    corrected:  HTMLCanvasElement;
  } | null = null;

  for (const cand of candidates) {
    await new Promise<void>(r => setTimeout(r, 0));
    try {
      const corrected      = warpToPage(workCanvas, cand);
      const { answers, confidence } = detectBubbles(corrected, totalItems, numChoices);
      const quality        = detectionQuality(answers, confidence);
      if (!best || quality > best.quality) {
        best = { quality, corners: cand, answers, confidence, corrected };
      }
    } catch { /* skip degenerate */ }
  }

  if (!best) throw new Error('Failed to process scan. Please retake the photo with better lighting.');

  const debugDataUrl = buildDebugDataUrl(best.corrected, best.answers, best.confidence, totalItems, numChoices);

  return {
    answers:             best.answers,
    confidence:          best.confidence,
    cornersAutoDetected: autoDetected,
    corners:             best.corners,
    debugDataUrl,
  };
}
