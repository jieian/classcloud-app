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
  PAGE_W: 612,
  PAGE_H: 792,
  CM_SIZE: 24,
  CM_TL: { x: 40,  y: 40  },
  CM_TR: { x: 548, y: 40  },
  CM_BL: { x: 40,  y: 753 },
  CM_BR: { x: 548, y: 753 },
  get CM_TL_C() { return { x: this.CM_TL.x + this.CM_SIZE / 2, y: this.CM_TL.y + this.CM_SIZE / 2 }; },
  get CM_TR_C() { return { x: this.CM_TR.x + this.CM_SIZE / 2, y: this.CM_TR.y + this.CM_SIZE / 2 }; },
  get CM_BL_C() { return { x: this.CM_BL.x + this.CM_SIZE / 2, y: this.CM_BL.y + this.CM_SIZE / 2 }; },
  get CM_BR_C() { return { x: this.CM_BR.x + this.CM_SIZE / 2, y: this.CM_BR.y + this.CM_SIZE / 2 }; },
  BUBBLE_R:       6,
  ROW_H:          22,
  CHOICE_SPACING: 25,
  GRID_START_Y:   195,
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

    const choices = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, numChoices);

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

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async (e) => {
  const { type, buffer, width, height, totalItems, numChoices, manualCorners } = e.data;
  if (type !== 'scan') return;

  try {
    self.postMessage({ type: 'status', message: 'Loading scanner engine\u2026' });
    if (!cv) await loadCV();

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
    const [c0, c1, c2, c3] = corners;
    // Try all 4 flip combinations so a wrong TL/TR/BL/BR assignment
    // (which happens when the paper is rotated in the photo) is corrected
    // by the quality score rather than silently producing a bad warp.
    const candidates = [
      [c0, c1, c2, c3],   // normal
      [c1, c0, c3, c2],   // L/R flipped
      [c2, c3, c0, c1],   // T/B flipped
      [c3, c2, c1, c0],   // both flipped
    ];

    let best = null;

    for (const cand of candidates) {
      try {
        const warped = warpToPage(buffer, width, height, cand, !usedPaperEdge);
        self.postMessage({ type: 'status', message: 'Reading bubbles\u2026' });
        const { answers, confidence } = detectBubbles(
          warped.buffer, warped.width, warped.height, totalItems, numChoices
        );
        const quality = detectionQuality(answers, confidence);
        if (!best || quality > best.quality) {
          best = { quality, corners: cand, answers, confidence, warped };
        }
      } catch (_) { /* skip degenerate orientation */ }
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
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
