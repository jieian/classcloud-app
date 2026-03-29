/**
 * omrService.ts — OMR engine coordinator
 *
 * All OpenCV operations run inside public/omr-worker.js (a Web Worker) so the
 * main thread is never blocked during WASM init or image processing.
 *
 * Main-thread responsibilities:
 *  1. loadImageToCanvas()  — decode File/Blob via <img> + <canvas>
 *  2. scaleCanvas()        — down-sample to MAX_SCAN_PX on the longest edge
 *  3. Extract ImageData    — get raw RGBA pixels to transfer to the worker
 *  4. Receive result       — rebuild a debug overlay canvas from the warped buffer
 *
 * Worker responsibilities (omr-worker.js):
 *  • OpenCV loading + WASM init
 *  • Corner marker detection (Otsu + contour filtering)
 *  • Perspective correction  (warpPerspective INTER_CUBIC)
 *  • Bubble detection        (adaptive threshold + fill fraction)
 */

import { OMR } from '@/lib/omrLayout';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Point { x: number; y: number; }

export interface DetectionResult {
  answers:             { [item: number]: string | null };
  confidence:          { [item: number]: { [choice: string]: number } };
  cornersAutoDetected: boolean;
  corners:             [Point, Point, Point, Point];
  debugDataUrl:        string;
}

export type CornerSet = [Point, Point, Point, Point];

// ─── Constants ────────────────────────────────────────────────────────────────

const WARP_SCALE  = 2;
const MAX_SCAN_PX = 1500;

// ─── Worker singleton ─────────────────────────────────────────────────────────

let _worker: Worker | null = null;

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker('/omr-worker.js');
  }
  return _worker;
}

// ─── 1. Load image ────────────────────────────────────────────────────────────

export function loadImageToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas    = document.createElement('canvas');
      canvas.width    = img.naturalWidth;
      canvas.height   = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src     = url;
  });
}

// ─── 2. Pre-scaler ────────────────────────────────────────────────────────────

function scaleCanvas(src: HTMLCanvasElement, maxPx: number): HTMLCanvasElement {
  const longest = Math.max(src.width, src.height);
  if (longest <= maxPx) return src;
  const s   = maxPx / longest;
  const dst = document.createElement('canvas');
  dst.width  = Math.round(src.width  * s);
  dst.height = Math.round(src.height * s);
  dst.getContext('2d')!.drawImage(src, 0, 0, dst.width, dst.height);
  return dst;
}

// ─── 3. QR reader ────────────────────────────────────────────────────────────

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

// ─── 4. Debug overlay ─────────────────────────────────────────────────────────

function buildDebugDataUrl(
  warpedBuffer: ArrayBuffer,
  warpedWidth:  number,
  warpedHeight: number,
  answers:    { [item: number]: string | null },
  confidence: { [item: number]: { [choice: string]: number } },
  totalItems: number,
  numChoices: number
): string {
  const canvas    = document.createElement('canvas');
  canvas.width    = warpedWidth;
  canvas.height   = warpedHeight;
  const ctx       = canvas.getContext('2d')!;

  // Reconstruct the warped image from the raw RGBA buffer
  const imageData = new ImageData(new Uint8ClampedArray(warpedBuffer), warpedWidth, warpedHeight);
  ctx.putImageData(imageData, 0, 0);

  const S       = WARP_SCALE;
  const choices = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, numChoices);
  const r       = OMR.BUBBLE_R * S * 1.1;  // slightly larger for visibility on phone screens

  for (let item = 1; item <= totalItems; item++) {
    choices.forEach((ch, ci) => {
      const center   = OMR.bubbleCenter(item, ci, totalItems);
      const cx       = center.x * S;
      const cy       = center.y * S;
      const isMarked = answers[item] === ch;
      const pct      = Math.round((confidence[item]?.[ch] ?? 0) * 100);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = isMarked ? '#00ff00' : '#ff4444';
      ctx.lineWidth   = isMarked ? 3 : 1.5;
      ctx.stroke();

      ctx.fillStyle    = isMarked ? '#00cc00' : '#ff4444';
      ctx.font         = `bold ${Math.round(r * 0.85)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(pct), cx, cy);
    });
  }

  return canvas.toDataURL('image/jpeg', 0.85);
}

// ─── 5. Main pipeline ─────────────────────────────────────────────────────────

export async function processAnswerSheet(
  file: File | Blob,
  totalItems: number,
  numChoices: number,
  manualCorners?: CornerSet,
  onStatus?: (msg: string) => void
): Promise<DetectionResult> {
  // Steps 1–3 run on the main thread (canvas / DOM APIs unavailable in workers)
  const rawCanvas  = await loadImageToCanvas(file);
  const workCanvas = scaleCanvas(rawCanvas, MAX_SCAN_PX);
  const scaleRatio = workCanvas.width / rawCanvas.width;

  const ctx       = workCanvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, workCanvas.width, workCanvas.height);

  // .slice(0) copies the buffer so we can transfer it (original stays valid for QR if needed)
  const buffer = imageData.data.buffer.slice(0);

  // Scale manual corners to match the down-sampled canvas
  const scaledCorners = manualCorners
    ? (manualCorners.map(c => ({ x: c.x * scaleRatio, y: c.y * scaleRatio })) as CornerSet)
    : undefined;

  return new Promise<DetectionResult>((resolve, reject) => {
    const worker = getWorker();

    const handler = (e: MessageEvent) => {
      const { type } = e.data;

      if (type === 'status') {
        onStatus?.(e.data.message);

      } else if (type === 'result') {
        worker.removeEventListener('message', handler);

        const {
          answers, confidence, corners, cornersAutoDetected,
          warpedBuffer, warpedWidth, warpedHeight,
        } = e.data;

        const debugDataUrl = buildDebugDataUrl(
          warpedBuffer, warpedWidth, warpedHeight,
          answers, confidence, totalItems, numChoices
        );

        resolve({
          answers,
          confidence,
          corners,
          cornersAutoDetected,
          debugDataUrl,
        });

      } else if (type === 'error') {
        worker.removeEventListener('message', handler);
        reject(new Error(e.data.message));
      }
    };

    worker.addEventListener('message', handler);

    worker.postMessage(
      {
        type:          'scan',
        buffer,
        width:         workCanvas.width,
        height:        workCanvas.height,
        totalItems,
        numChoices,
        manualCorners: scaledCorners ?? null,
      },
      [buffer]  // transfer the ArrayBuffer (zero-copy)
    );
  });
}
