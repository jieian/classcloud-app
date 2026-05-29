/**
 * omr-worker.js — Web Worker that runs all OpenCV OMR operations off the main thread.
 *
 * Pipeline (triggered by a 'scan' message):
 *  1. loadCV()         — importScripts('/opencv.js') + poll for WASM init
 *  2. detectCorners()  — Otsu threshold + contour filtering for the 4 black squares
 *  3. warpToPage()     — cv.warpPerspective (INTER_CUBIC) to PAGE_W × PAGE_H
 *  4. detectBubbles()  — adaptive threshold per-bubble, fill fraction scoring
 *
 * Messages received:
 *   { type: 'scan', buffer, width, height, totalItems, numChoices, manualCorners }
 *
 * Messages sent:
 *   { type: 'status',  message }
 *   { type: 'result',  answers, confidence, corners, cornersAutoDetected,
 *                      warpedBuffer, warpedWidth, warpedHeight }
 *   { type: 'error',   message }
 */

// ─── OMR Layout Constants ─────────────────────────────────────────────────────

const OMR = {
  PAGE_W: 595,
  PAGE_H: 842,
  CM_SIZE: 24,
  CM_TL: { x: 40,  y: 40  },
  CM_TR: { x: 531, y: 40  },
  CM_BL: { x: 40,  y: 803 },
  CM_BR: { x: 531, y: 803 },
  get CM_TL_C() { return { x: this.CM_TL.x + this.CM_SIZE / 2, y: this.CM_TL.y + this.CM_SIZE / 2 }; },
  get CM_TR_C() { return { x: this.CM_TR.x + this.CM_SIZE / 2, y: this.CM_TR.y + this.CM_SIZE / 2 }; },
  get CM_BL_C() { return { x: this.CM_BL.x + this.CM_SIZE / 2, y: this.CM_BL.y + this.CM_SIZE / 2 }; },
  get CM_BR_C() { return { x: this.CM_BR.x + this.CM_SIZE / 2, y: this.CM_BR.y + this.CM_SIZE / 2 }; },
  // QR code region (top-right of correctly oriented sheet)
  QR_X: 453, QR_Y: 38, QR_SIZE: 72,
  HEADER_END_Y: 175,
  BUBBLE_R:       6,
  ROW_H:          22,
  CHOICE_SPACING: 25,
  GRID_START_Y:   203,
  COL1_FIRST_BUBBLE_X: 82,
  COL2_FIRST_BUBBLE_X: 345,
  bubbleCenter(itemNumber, choiceIndex, totalItems) {
    const itemsInCol1 = Math.ceil(totalItems / 2);
    const col = itemNumber <= itemsInCol1 ? 1 : 2;
    const rowInCol = col === 1 ? itemNumber - 1 : itemNumber - itemsInCol1 - 1;
    const baseX = col === 1 ? this.COL1_FIRST_BUBBLE_X : this.COL2_FIRST_BUBBLE_X;
    return {
      x: baseX + choiceIndex * this.CHOICE_SPACING,
      y: this.GRID_START_Y + rowInCol * this.ROW_H,
    };
  },
};

const WARP_SCALE     = 2;
const FILL_THRESHOLD = 0.04;  // minimum fill to count as marked (calibrated for HB/Mongol No.2 pencil)
const FILL_DELTA     = 0.02;  // minimum gap between top-2 to confirm the winner

// ─── OpenCV initialization ────────────────────────────────────────────────────

let cv = null;

function loadCV() {
  return new Promise((resolve, reject) => {
    importScripts('/opencv.js');
    const t = Date.now();
    const poll = setInterval(() => {
      if (self.cv && self.cv.Mat) {
        clearInterval(poll);
        cv = self.cv;
        resolve();
      } else if (Date.now() - t > 30000) {
        clearInterval(poll);
        reject(new Error('OpenCV WASM did not initialize within 30s'));
      }
    }, 100);
  });
}

// ─── Buffer ↔ Mat helpers ─────────────────────────────────────────────────────

function bufferToMat(buffer, width, height) {
  const mat = new cv.Mat(height, width, cv.CV_8UC4);
  mat.data.set(new Uint8ClampedArray(buffer));
  return mat;
}

function matToBuffer(mat) {
  let rgba;
  if (mat.channels() === 4) {
    rgba = mat;
  } else if (mat.channels() === 3) {
    rgba = new cv.Mat();
    cv.cvtColor(mat, rgba, cv.COLOR_BGR2RGBA);
  } else {
    rgba = new cv.Mat();
    cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
  }
  const buf = new Uint8ClampedArray(rgba.data).buffer;
  if (rgba !== mat) rgba.delete();
  return buf;
}

// ─── Corner detection ─────────────────────────────────────────────────────────

/**
 * Assign 4+ candidate points to TL/TR/BL/BR using image quadrants.
 * Each quadrant contributes exactly one representative (the most corner-like).
 */
function assignCorners(pts) {
  if (pts.length < 4) return null;

  // Use centroid of candidates as split point — works even when the sheet
  // is centred in the photo and all markers fall near the image middle.
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;

  const quads = [[], [], [], []];
  for (const p of pts) {
    quads[(p.y >= cy ? 2 : 0) + (p.x >= cx ? 1 : 0)].push(p);
  }

  const tl = quads[0].sort((a, b) => (a.x + a.y) - (b.x + b.y))[0];
  const tr = quads[1].sort((a, b) => (b.x - b.y) - (a.x - a.y))[0];
  const bl = quads[2].sort((a, b) => (a.x - a.y) - (b.x - b.y))[0];
  const br = quads[3].sort((a, b) => (b.x + b.y) - (a.x + a.y))[0];

  if (!tl || !tr || !bl || !br) return null;
  return [tl, tr, bl, br];
}

/** Extract square candidates from an already-thresholded binary image. */
function findCandidates(gray, binary, width, solidityMin, darknessMax) {
  const morphed  = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarch = new cv.Mat();
  try {
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.morphologyEx(binary, morphed, cv.MORPH_CLOSE, kernel);
    kernel.delete();
    cv.findContours(morphed, contours, hierarch, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const scaleEst = width / OMR.PAGE_W;
    const targetSz = OMR.CM_SIZE * scaleEst;
    // Corner marker: 24×24pt solid square  → area ≈ targetSz²   (100%)
    // Bubble circle: radius 8pt            → area ≈ 0.35×targetSz² ( 35%)
    // Floor at 0.70² = 49% filters bubbles while keeping markers with headroom.
    // Ceiling at 2.5² = 625% filters the QR code and large text blocks.
    const minArea  = Math.pow(targetSz * 0.70, 2);
    const maxArea  = Math.pow(targetSz * 2.50, 2);
    const result   = [];

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area    = cv.contourArea(contour);
      if (area < minArea || area > maxArea) continue;

      const rect = cv.boundingRect(contour);
      const ar   = rect.width / rect.height;
      // Corner markers are squares; reject highly elongated shapes (text, lines)
      if (ar < 0.40 || ar > 2.50) continue;

      const hull     = new cv.Mat();
      cv.convexHull(contour, hull, false, true);
      const hullArea = cv.contourArea(hull);
      hull.delete();
      if (hullArea < 1 || area / hullArea < solidityMin) continue;

      const roiRect = new cv.Rect(
        Math.max(0, rect.x + 1), Math.max(0, rect.y + 1),
        Math.max(1, rect.width - 2), Math.max(1, rect.height - 2)
      );
      const roi     = gray.roi(roiRect);
      const meanVal = cv.mean(roi);
      roi.delete();
      if (meanVal[0] > darknessMax) continue;

      result.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    }
    return result;
  } finally {
    morphed.delete(); contours.delete(); hierarch.delete();
  }
}

function detectCorners(buffer, width, height) {
  const src     = bufferToMat(buffer, width, height);
  const gray    = new cv.Mat();
  const blurred = new cv.Mat();
  const binary  = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    // 9×9 kernel smooths JPEG compression artifacts around corner marker edges
    // (common on Android phones). Larger blur = more stable contour centroids
    // = more accurate homography. Has no negative effect on clean iPhone images.
    cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 0);
    cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

    // Pass 1 — strict
    let cands = findCandidates(gray, binary, width, 0.65, 120);
    console.log('[OMR worker] pass1 candidates:', cands.length, cands.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '));
    let result = cands.length >= 4 ? assignCorners(cands) : null;
    if (result) { console.log('[OMR worker] corners found pass1'); return result; }

    // Pass 2 — relaxed solidity + darkness
    cands  = findCandidates(gray, binary, width, 0.45, 170);
    console.log('[OMR worker] pass2 candidates:', cands.length, cands.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '));
    result = cands.length >= 4 ? assignCorners(cands) : null;
    if (result) { console.log('[OMR worker] corners found pass2'); return result; }

    // Pass 3 — adaptive threshold fallback (handles uneven lighting)
    const adaptive = new cv.Mat();
    cv.adaptiveThreshold(blurred, adaptive, 255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 51, 8);
    cands  = findCandidates(gray, adaptive, width, 0.45, 170);
    adaptive.delete();
    console.log('[OMR worker] pass3 candidates:', cands.length, cands.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '));
    result = cands.length >= 4 ? assignCorners(cands) : null;
    if (result) { console.log('[OMR worker] corners found pass3'); return result; }

    console.log('[OMR worker] all passes failed — no corners detected');
    return null;

  } finally {
    src.delete(); gray.delete(); blurred.delete(); binary.delete();
  }
}

// ─── Paper-edge detection (fallback when corner markers not found) ────────────

/**
 * Detects the 4 corners of the answer sheet itself using Canny edge detection
 * + largest-quadrilateral contour approximation.
 * Used as a fallback when the corner black-square markers are not detectable
 * (e.g. extreme angle, partial occlusion, cut-off edges).
 * Returns [tl, tr, bl, br] in image coordinates, or null on failure.
 */
function detectPaperEdge(buffer, width, height) {
  const src     = bufferToMat(buffer, width, height);
  const gray    = new cv.Mat();
  const blurred = new cv.Mat();
  const edges   = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0);
    cv.Canny(blurred, edges, 30, 90);

    // Dilate to bridge small gaps along the paper boundary
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.dilate(edges, edges, kernel);
    kernel.delete();

    const contours  = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let bestQuad = null;
    let bestArea = 0;
    const imgArea = width * height;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area    = cv.contourArea(contour);

      // Paper must cover at least 15% of the photo
      if (area < imgArea * 0.15) continue;

      const peri   = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * peri, true);

      // Accept only 4-sided shapes larger than any previous candidate
      if (approx.rows === 4 && area > bestArea) {
        bestArea = area;
        bestQuad = [];
        for (let j = 0; j < 4; j++) {
          bestQuad.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
        }
      }
      approx.delete();
    }

    contours.delete(); hierarchy.delete();

    if (!bestQuad) {
      console.log('[OMR worker] detectPaperEdge: no quadrilateral found');
      return null;
    }

    const corners = assignCorners(bestQuad);
    console.log('[OMR worker] detectPaperEdge: paper corners',
      corners?.map(c => `(${Math.round(c.x)},${Math.round(c.y)})`).join(' '));
    return corners;

  } finally {
    src.delete(); gray.delete(); blurred.delete(); edges.delete();
  }
}

// ─── Perspective warp ─────────────────────────────────────────────────────────

/**
 * @param {boolean} srcIsMarkers
 *   true  → src corners are corner-marker centres; warp them to their known
 *           layout positions (most accurate — default behaviour).
 *   false → src corners are the paper's physical edges; warp them to fill the
 *           full PAGE_W × PAGE_H canvas (fallback; bubble coords stay valid
 *           because they are defined relative to the page origin).
 */
function warpToPage(buffer, width, height, corners, srcIsMarkers = true) {
  const [tl, tr, bl, br] = corners;
  const S = WARP_SCALE;

  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y,
    tr.x, tr.y,
    bl.x, bl.y,
    br.x, br.y,
  ]);

  const dstPts = srcIsMarkers
    ? cv.matFromArray(4, 1, cv.CV_32FC2, [
        OMR.CM_TL_C.x * S, OMR.CM_TL_C.y * S,
        OMR.CM_TR_C.x * S, OMR.CM_TR_C.y * S,
        OMR.CM_BL_C.x * S, OMR.CM_BL_C.y * S,
        OMR.CM_BR_C.x * S, OMR.CM_BR_C.y * S,
      ])
    : cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,              0,
        OMR.PAGE_W * S, 0,
        0,              OMR.PAGE_H * S,
        OMR.PAGE_W * S, OMR.PAGE_H * S,
      ]);

  const M   = cv.getPerspectiveTransform(srcPts, dstPts);
  srcPts.delete(); dstPts.delete();

  const src = bufferToMat(buffer, width, height);
  const dst = new cv.Mat();
  cv.warpPerspective(
    src, dst, M,
    new cv.Size(OMR.PAGE_W * S, OMR.PAGE_H * S),
    cv.INTER_CUBIC,
    cv.BORDER_CONSTANT,
    new cv.Scalar(255, 255, 255, 255)
  );
  M.delete(); src.delete();

  const resultBuf = matToBuffer(dst);
  dst.delete();

  return { buffer: resultBuf, width: OMR.PAGE_W * S, height: OMR.PAGE_H * S };
}

function enhanceWarpedDocument(buffer, width, height) {
  const src        = bufferToMat(buffer, width, height);
  const gray       = new cv.Mat();
  const background = new cv.Mat();
  const normalized = new cv.Mat();
  const contrast   = new cv.Mat();
  const blended    = new cv.Mat();
  const cleaned    = new cv.Mat();
  const rgba       = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Estimate slow lighting changes across the page, then normalize the sheet
    // so shadows and warm camera casts become closer to clean white paper.
    const blurSize = Math.max(41, Math.floor(Math.min(width, height) / 18) | 1);
    cv.GaussianBlur(gray, background, new cv.Size(blurSize, blurSize), 0);
    cv.divide(gray, background, normalized, 255);

    // Keep the preview natural: lift shadows, but keep enough of the original
    // gray channel so light pencil fills and fine bubble outlines do not wash out.
    normalized.convertTo(contrast, cv.CV_8UC1, 1.12, -10);
    cv.addWeighted(contrast, 0.55, gray, 0.45, 6, blended);
    blended.copyTo(cleaned);
    cv.cvtColor(cleaned, rgba, cv.COLOR_GRAY2RGBA);

    return { buffer: matToBuffer(rgba), width, height };
  } finally {
    src.delete();
    gray.delete();
    background.delete();
    normalized.delete();
    contrast.delete();
    blended.delete();
    cleaned.delete();
    rgba.delete();
  }
}

// ─── Bubble detection ─────────────────────────────────────────────────────────

function detectBubbles(buffer, width, height, totalItems, numChoices) {
  const S       = WARP_SCALE;
  const src     = bufferToMat(buffer, width, height);
  const gray    = new cv.Mat();
  const blurred = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    // Slight blur to suppress JPEG/photo noise before sampling
    cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0);

    const bubR = OMR.BUBBLE_R * S;
    // 65% of bubble radius: tight enough to avoid bleed into adjacent bubbles
    // while still covering the core fill area inside the printed outline.
    const r    = Math.max(2, Math.round(bubR * 0.65));

    const normalizedNumChoices = Number(numChoices) >= 5 ? 5 : 4;
    const choices = ['A', 'B', 'C', 'D', 'E'].slice(0, normalizedNumChoices);

    // ── Pass 1: collect raw mean grayscale for every bubble ───────────────────
    // Lower mean = darker = more likely filled.
    const meanMap = {};   // { item: { ch: rawMean } }
    const allMeans = [];  // all values — used to estimate paper baseline

    for (let item = 1; item <= totalItems; item++) {
      meanMap[item] = {};
      choices.forEach((ch, ci) => {
        const center = OMR.bubbleCenter(item, ci, totalItems);
        const cx = Math.round(center.x * S);
        const cy = Math.round(center.y * S);

        const rx = Math.max(0, cx - r);
        const ry = Math.max(0, cy - r);
        const rw = Math.min(width  - rx, r * 2);
        const rh = Math.min(height - ry, r * 2);
        if (rw <= 0 || rh <= 0) { meanMap[item][ch] = 255; allMeans.push(255); return; }

        const roi  = blurred.roi(new cv.Rect(rx, ry, rw, rh));
        const mask = cv.Mat.zeros(rh, rw, cv.CV_8UC1);
        cv.circle(mask, new cv.Point(cx - rx, cy - ry), r, new cv.Scalar(255), cv.FILLED);
        const rawMean = cv.mean(roi, mask)[0];
        roi.delete(); mask.delete();

        meanMap[item][ch] = rawMean;
        allMeans.push(rawMean);
      });
    }

    // ── Global brightness floor ───────────────────────────────────────────────
    // Used only as a sanity check; actual normalisation is per-item below.
    allMeans.sort((a, b) => b - a);
    const topN           = Math.max(1, Math.floor(allMeans.length * 0.20));
    const globalBaseline = allMeans.slice(0, topN).reduce((s, v) => s + v, 0) / topN;
    console.log(`[OMR] globalBaseline=${globalBaseline.toFixed(1)}`);

    // ── Pass 2: per-item normalised fill fraction ─────────────────────────────
    // Per-item baseline = brightest bubble in that item's row.
    // This automatically compensates for alternating row shading (B&W print)
    // and local lighting gradients across the page.
    const answers    = {};
    const confidence = {};

    for (let item = 1; item <= totalItems; item++) {
      // Brightest bubble in this row ≈ empty paper colour for that row
      const rowMeans    = choices.map(ch => meanMap[item]?.[ch] ?? 255);
      const itemBaseline = Math.max(...rowMeans);

      const fills = choices.map(ch => {
        const rawMean = meanMap[item]?.[ch] ?? 255;
        // fill ∈ [0, 1]: 0 = as bright as brightest bubble (empty), 1 = completely dark
        const fill = itemBaseline > 20
          ? Math.max(0, 1 - rawMean / itemBaseline)
          : 0;
        return { ch, fill };
      });

      const sorted     = [...fills].sort((a, b) => b.fill - a.fill);
      const topFill    = sorted[0]?.fill ?? 0;
      const secondFill = sorted[1]?.fill ?? 0;

      answers[item] = (topFill >= FILL_THRESHOLD && topFill - secondFill >= FILL_DELTA)
        ? sorted[0].ch
        : null;

      confidence[item] = {};
      fills.forEach(({ ch, fill }) => { confidence[item][ch] = fill; });

      // Log every item so we can see raw fill scores
      console.log(`[OMR] item${String(item).padStart(2,'0')}: ${
        fills.map(f => `${f.ch}=${f.fill.toFixed(2)}`).join(' ')
      } → ${answers[item] ?? 'null'}`);
    }

    return { answers, confidence };

  } finally {
    src.delete(); gray.delete(); blurred.delete();
  }
}

// ─── QR region orientation check ──────────────────────────────────────────────
// The QR code sits at the top-right of a correctly oriented sheet.
// It has high pixel-value variance (many black/white transitions).
// A wrong orientation puts blank paper there (low variance).
// Returns the standard deviation of grayscale values in the QR region.

function qrRegionStdDev(buffer, width, height) {
  const S   = WARP_SCALE;
  const src = bufferToMat(buffer, width, height);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const rx = Math.round(OMR.QR_X * S);
  const ry = Math.round(OMR.QR_Y * S);
  const rw = Math.min(Math.round(OMR.QR_SIZE * S), width  - rx);
  const rh = Math.min(Math.round(OMR.QR_SIZE * S), height - ry);

  let std = 0;
  if (rw > 4 && rh > 4) {
    const roi    = gray.roi(new cv.Rect(rx, ry, rw, rh));
    const mean   = new cv.Mat();
    const stddev = new cv.Mat();
    cv.meanStdDev(roi, mean, stddev);
    std = stddev.data64F[0];
    roi.delete(); mean.delete(); stddev.delete();
  }

  src.delete(); gray.delete();
  return std;
}

function regionEdgeDensity(edges, x, y, w, h) {
  const rx = Math.max(0, Math.min(edges.cols - 1, Math.floor(x)));
  const ry = Math.max(0, Math.min(edges.rows - 1, Math.floor(y)));
  const rw = Math.max(0, Math.min(edges.cols - rx, Math.floor(w)));
  const rh = Math.max(0, Math.min(edges.rows - ry, Math.floor(h)));
  if (rw < 2 || rh < 2) return 0;

  const roi = edges.roi(new cv.Rect(rx, ry, rw, rh));
  const edgeCount = cv.countNonZero(roi);
  roi.delete();
  return edgeCount / (rw * rh);
}

function regionTextureScore(gray, edges, x, y, w, h) {
  const rx = Math.max(0, Math.min(gray.cols - 1, Math.floor(x)));
  const ry = Math.max(0, Math.min(gray.rows - 1, Math.floor(y)));
  const rw = Math.max(0, Math.min(gray.cols - rx, Math.floor(w)));
  const rh = Math.max(0, Math.min(gray.rows - ry, Math.floor(h)));
  if (rw < 8 || rh < 8) return 0;

  const rect = new cv.Rect(rx, ry, rw, rh);
  const grayRoi = gray.roi(rect);
  const edgeRoi = edges.roi(rect);
  const mean = new cv.Mat();
  const stddev = new cv.Mat();

  try {
    cv.meanStdDev(grayRoi, mean, stddev);
    const std = stddev.data64F[0];
    const edgeDensity = cv.countNonZero(edgeRoi) / (rw * rh);

    const dark = new cv.Mat();
    cv.threshold(grayRoi, dark, 150, 255, cv.THRESH_BINARY_INV);
    const darkRatio = cv.countNonZero(dark) / (rw * rh);
    dark.delete();

    const darkBonus = darkRatio > 0.08 && darkRatio < 0.65 ? 1 : 0;
    return std * 0.02 + edgeDensity * 10 + darkBonus;
  } finally {
    grayRoi.delete();
    edgeRoi.delete();
    mean.delete();
    stddev.delete();
  }
}

// Extra orientation signal from known page layout:
// - top header area is denser than footer area
// - QR corner (top-right) is denser than the opposite corner (bottom-left)
function layoutOrientationScore(buffer, width, height) {
  const src     = bufferToMat(buffer, width, height);
  const gray    = new cv.Mat();
  const blurred = new cv.Mat();
  const edges   = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0);
    cv.Canny(blurred, edges, 60, 160);

    const S = WARP_SCALE;
    const topInset = Math.round((OMR.CM_TL_C.y + 4) * S);
    const bandH = Math.max(20, Math.round((OMR.HEADER_END_Y - OMR.CM_TL_C.y) * S));
    const bottomY = Math.max(0, height - topInset - bandH);

    const topDensity = regionEdgeDensity(edges, 0, topInset, width, bandH);
    const bottomDensity = regionEdgeDensity(edges, 0, bottomY, width, bandH);

    const qrPad = Math.round(8 * S);
    const qrX = Math.round(OMR.QR_X * S) - qrPad;
    const qrY = Math.round(OMR.QR_Y * S) - qrPad;
    const qrW = Math.round(OMR.QR_SIZE * S) + qrPad * 2;
    const qrH = Math.round(OMR.QR_SIZE * S) + qrPad * 2;
    const qrDensity = regionEdgeDensity(edges, qrX, qrY, qrW, qrH);

    const oppositeQrX = Math.round((OMR.PAGE_W - OMR.QR_X - OMR.QR_SIZE) * S) - qrPad;
    const oppositeQrY = Math.round((OMR.PAGE_H - OMR.QR_Y - OMR.QR_SIZE) * S) - qrPad;
    const oppositeQrDensity = regionEdgeDensity(edges, oppositeQrX, oppositeQrY, qrW, qrH);

    const qrTexture = regionTextureScore(gray, edges, qrX, qrY, qrW, qrH);
    const otherQrTexture = Math.max(
      regionTextureScore(gray, edges, oppositeQrX, qrY, qrW, qrH),
      regionTextureScore(gray, edges, qrX, oppositeQrY, qrW, qrH),
      regionTextureScore(gray, edges, oppositeQrX, oppositeQrY, qrW, qrH)
    );

    const score =
      (topDensity - bottomDensity) * 90 +
      (qrDensity - oppositeQrDensity) * 140 +
      (qrTexture - otherQrTexture) * 8;

    return {
      score,
      topDensity,
      bottomDensity,
      qrDensity,
      oppositeQrDensity,
      qrTexture,
      otherQrTexture,
    };
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
  }
}

function buildOrientationCandidates(corners) {
  const [c0, c1, c2, c3] = corners;
  const transforms = [
    [c0, c1, c2, c3], // 0 deg
    [c2, c0, c3, c1], // 90 deg
    [c3, c2, c1, c0], // 180 deg
    [c1, c3, c0, c2], // 270 deg
    [c1, c0, c3, c2], // mirror left-right
    [c2, c3, c0, c1], // mirror top-bottom
    [c0, c2, c1, c3], // transpose
    [c3, c1, c2, c0], // anti-transpose
  ];

  const seen = new Set();
  const unique = [];
  for (const cand of transforms) {
    const key = cand.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cand);
  }
  return unique;
}

// ─── Quality score ────────────────────────────────────────────────────────────

function detectionQuality(answers, confidence) {
  let score = 0, items = 0;
  for (const key of Object.keys(confidence)) {
    const item   = Number(key);
    const values = Object.values(confidence[item] || {}).sort((a, b) => b - a);
    if (!values.length) continue;
    const top    = values[0] || 0;
    const second = values[1] || 0;
    score += top * 1.4 + (top - second) * 2.2;
    if (answers[item])           score += 0.15;
    if (top < 0.07)              score -= 0.20;
    if (top - second < 0.04)     score -= 0.15;
    items++;
  }
  return items ? score / items : -1e9;
}

function polygonArea(corners) {
  if (!corners || corners.length !== 4) return 0;
  let area = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function frameMetrics(buffer, width, height) {
  const src = bufferToMat(buffer, width, height);
  const gray = new cv.Mat();
  const lap = new cv.Mat();
  const mean = new cv.Mat();
  const stddev = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.meanStdDev(gray, mean, stddev);
    const brightness = mean.data64F[0];

    cv.Laplacian(gray, lap, cv.CV_64F);
    cv.meanStdDev(lap, mean, stddev);
    const blur = Math.pow(stddev.data64F[0], 2);

    return { brightness, blur };
  } finally {
    src.delete();
    gray.delete();
    lap.delete();
    mean.delete();
    stddev.delete();
  }
}

function markerCornersToPageCorners(markerCorners) {
  const [tl, tr, bl, br] = markerCorners;
  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    OMR.CM_TL_C.x, OMR.CM_TL_C.y,
    OMR.CM_TR_C.x, OMR.CM_TR_C.y,
    OMR.CM_BL_C.x, OMR.CM_BL_C.y,
    OMR.CM_BR_C.x, OMR.CM_BR_C.y,
  ]);
  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y,
    tr.x, tr.y,
    bl.x, bl.y,
    br.x, br.y,
  ]);
  const pagePts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    OMR.PAGE_W, 0,
    0, OMR.PAGE_H,
    OMR.PAGE_W, OMR.PAGE_H,
  ]);
  const transformed = new cv.Mat();

  try {
    const M = cv.getPerspectiveTransform(srcPts, dstPts);
    cv.perspectiveTransform(pagePts, transformed, M);
    M.delete();
    return [
      { x: transformed.data32F[0], y: transformed.data32F[1] },
      { x: transformed.data32F[2], y: transformed.data32F[3] },
      { x: transformed.data32F[4], y: transformed.data32F[5] },
      { x: transformed.data32F[6], y: transformed.data32F[7] },
    ];
  } finally {
    srcPts.delete();
    dstPts.delete();
    pagePts.delete();
    transformed.delete();
  }
}

function detectDocumentFrame(buffer, width, height) {
  const metrics = frameMetrics(buffer, width, height);
  let markerCorners = detectCorners(buffer, width, height);
  let corners = markerCorners ? markerCornersToPageCorners(markerCorners) : null;
  let usedPaperEdge = false;

  if (!corners) {
    corners = detectPaperEdge(buffer, width, height);
    usedPaperEdge = Boolean(corners);
  }

  if (!corners) {
    return {
      corners: null,
      confidence: 0,
      brightness: metrics.brightness,
      blur: metrics.blur,
      isVisible: false,
      usedPaperEdge,
      width,
      height,
    };
  }

  const areaRatio = polygonArea(corners) / (width * height);
  const minMargin = Math.min(
    ...corners.map((p) => Math.min(p.x, p.y, width - p.x, height - p.y))
  );
  const marginTarget = Math.min(width, height) * 0.018;
  const insideFrame = minMargin > 0;
  const brightnessOk = metrics.brightness > 35 && metrics.brightness < 235;
  const blurOk = metrics.blur > 35;
  const areaScore = Math.max(0, Math.min(1, (areaRatio - 0.18) / 0.42));
  const marginScore = insideFrame ? 1 : Math.max(0, minMargin / marginTarget);
  const lightScore = brightnessOk ? 1 : 0.45;
  const blurScore = blurOk ? 1 : Math.max(0.35, metrics.blur / 35);
  const confidence = Math.max(
    0,
    Math.min(1, areaScore * 0.55 + marginScore * 0.2 + lightScore * 0.1 + blurScore * 0.15)
  );

  return {
    corners,
    confidence,
    brightness: metrics.brightness,
    blur: metrics.blur,
    isVisible: confidence >= 0.52 && insideFrame && areaRatio >= 0.18 && brightnessOk,
    usedPaperEdge,
    width,
    height,
  };
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async (e) => {
  const { type, buffer, width, height, totalItems, numChoices, manualCorners } = e.data;

  try {
    self.postMessage({ type: 'status', message: 'Loading scanner engine\u2026' });
    if (!cv) await loadCV();

    if (type === 'detectDocument') {
      self.postMessage({
        type: 'documentResult',
        result: detectDocumentFrame(buffer, width, height),
      });
      return;
    }

    if (type !== 'scan') return;

    let corners, autoDetected, usedPaperEdge = false;

    if (manualCorners) {
      corners      = manualCorners;
      autoDetected = false;
    } else {
      self.postMessage({ type: 'status', message: 'Detecting corner markers\u2026' });
      corners = detectCorners(buffer, width, height);
      if (!corners) {
        self.postMessage({ type: 'status', message: 'Corner markers not found \u2014 trying paper edge detection\u2026' });
        corners = detectPaperEdge(buffer, width, height);
        if (!corners) {
          throw new Error(
            'Could not detect the answer sheet. Make sure the full sheet is visible and the photo is well-lit.'
          );
        }
        usedPaperEdge = true;
      }
      autoDetected = true;
    }

    self.postMessage({ type: 'status', message: 'Correcting perspective\u2026' });
    // Try all 8 rectangle orientations (rotations + mirrors), then select
    // the best candidate using bubble confidence plus layout orientation cues.
    const candidates = buildOrientationCandidates(corners);

    let best = null;

    for (let ci = 0; ci < candidates.length; ci++) {
      const cand = candidates[ci];
      try {
        const warped = warpToPage(buffer, width, height, cand, !usedPaperEdge);
        const enhanced = enhanceWarpedDocument(warped.buffer, warped.width, warped.height);
        self.postMessage({ type: 'status', message: 'Reading bubbles\u2026' });
        const { answers, confidence } = detectBubbles(
          enhanced.buffer, enhanced.width, enhanced.height, totalItems, numChoices
        );
        const bubbleQuality = detectionQuality(answers, confidence);
        let quality = bubbleQuality;

        // QR-code orientation bonus: the QR code region has high pixel variance
        // (many B/W transitions) only in the correct orientation.
        // A wrong orientation puts blank paper there (stddev ~ 5-15).
        // Correct orientation with QR present gives stddev ~ 40-80+.
        // Use this as a light bonus, then rely more on structural layout score.
        const qrStd = qrRegionStdDev(enhanced.buffer, enhanced.width, enhanced.height);
        const qrBonus = qrStd > 35 ? 0.8 : qrStd > 25 ? 0.3 : 0;
        quality += qrBonus;

        const layout = layoutOrientationScore(enhanced.buffer, enhanced.width, enhanced.height);
        quality += layout.score;

        console.log(
          `[OMR] orientation ${ci}:` +
          ` bubbleQuality=${bubbleQuality.toFixed(3)}` +
          ` qrStd=${qrStd.toFixed(1)}` +
          ` qrBonus=${qrBonus.toFixed(2)}` +
          ` layout=${layout.score.toFixed(3)}` +
          ` top=${layout.topDensity.toFixed(4)}` +
          ` bottom=${layout.bottomDensity.toFixed(4)}` +
          ` qr=${layout.qrDensity.toFixed(4)}` +
          ` opp=${layout.oppositeQrDensity.toFixed(4)}` +
          ` total=${quality.toFixed(3)}`
        );

        if (!best || quality > best.quality) {
          best = { quality, corners: cand, answers, confidence, warped: enhanced };
        }
      } catch { /* skip degenerate orientation */ }
    }

    if (!best) {
      throw new Error('Failed to process scan. Please retake the photo with better lighting.');
    }

    self.postMessage(
      {
        type:                'result',
        answers:             best.answers,
        confidence:          best.confidence,
        corners:             manualCorners ?? best.corners,
        cornersAutoDetected: autoDetected,
        warpedBuffer:        best.warped.buffer,
        warpedWidth:         best.warped.width,
        warpedHeight:        best.warped.height,
      },
      [best.warped.buffer]  // transfer the ArrayBuffer (zero-copy)
    );

  } catch (err) {
    self.postMessage({
      type: type === 'detectDocument' ? 'documentError' : 'error',
      message: err.message || String(err),
    });
  }
};
