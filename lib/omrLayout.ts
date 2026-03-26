/**
 * omrLayout.ts
 *
 * Single source of truth for the OMR answer sheet geometry.
 * These constants are used by BOTH:
 *  1. examPdfService.ts  — to PLACE elements when generating the PDF
 *  2. omrService.ts      — to FIND elements when detecting answers in a scan
 *
 * All units are PDF points (pt), where 72pt = 1 inch.
 * Letter page = 612 × 792 pt.
 *
 * After perspective correction, the scanned image is mapped to exactly
 * PAGE_W × PAGE_H pixels, so 1px == 1pt. This makes sampling trivial.
 */

export const OMR = {
  // ─── Page ─────────────────────────────────────────────────────────────────
  PAGE_W: 612,
  PAGE_H: 792,

  // ─── Corner Markers ────────────────────────────────────────────────────────
  // Solid black squares used for perspective detection.
  // Position = top-left of each square.
  // Center of each marker used as the reference point for homography.
  // Inset markers from paper edges so phone/webcam wide shots can include all corners more easily.
  CM_SIZE: 24,   // square side length in pt
  CM_TL: { x: 40,  y: 40  },   // top-left marker
  CM_TR: { x: 548, y: 40  },   // top-right marker  (612 - 40 - 24)
  CM_BL: { x: 40,  y: 753 },   // bottom-left marker (792 - 15 - 24 = 753; 15pt bottom margin keeps clearance from last bubble row)
  CM_BR: { x: 548, y: 753 },   // bottom-right marker

  // Computed: center of each corner marker
  get CM_TL_C() { return { x: this.CM_TL.x + this.CM_SIZE / 2, y: this.CM_TL.y + this.CM_SIZE / 2 }; },
  get CM_TR_C() { return { x: this.CM_TR.x + this.CM_SIZE / 2, y: this.CM_TR.y + this.CM_SIZE / 2 }; },
  get CM_BL_C() { return { x: this.CM_BL.x + this.CM_SIZE / 2, y: this.CM_BL.y + this.CM_SIZE / 2 }; },
  get CM_BR_C() { return { x: this.CM_BR.x + this.CM_SIZE / 2, y: this.CM_BR.y + this.CM_SIZE / 2 }; },

  // ─── QR Code ──────────────────────────────────────────────────────────────
  QR_X:    453,   // top-left x
  QR_Y:    38,    // top-left y
  QR_SIZE: 72,    // width & height in pt

  // ─── Header ───────────────────────────────────────────────────────────────
  HEADER_END_Y: 175,  // y-coordinate where the header area ends

  // ─── Bubble Grid ──────────────────────────────────────────────────────────
  BUBBLE_R:       6,    // bubble circle radius in pt
  FILL_THRESHOLD: 0.04, // fraction difference from local background to detect fill (calibrated for HB/Mongol No.2 pencil)
  FILL_DELTA:     0.02, // second-best gap required to avoid ambiguous multi-fill
  ROW_H:          22,   // vertical distance between bubble row centers (≥ 2×BUBBLE_R + gap)
  CHOICE_SPACING: 25,   // horizontal distance between choice bubble centers (≥ 2×BUBBLE_R + gap)
  GRID_START_Y:   195,  // y-center of the first row of bubbles
  ITEMS_PER_COL:  20,   // maximum items per column

  // Column 1 — items 1–20
  COL1_NUM_X: 52,       // x for printing item number text
  COL1_FIRST_BUBBLE_X: 82,  // x-center of choice A in col 1

  // Column 2 — items 21–40
  COL2_NUM_X: 315,
  COL2_FIRST_BUBBLE_X: 345,

  // ─── Helpers ──────────────────────────────────────────────────────────────
  /**
   * Returns the canonical (x, y) center of a bubble in PDF-point space.
   * @param itemNumber  1-based item number
   * @param choiceIndex 0=A, 1=B, 2=C, 3=D, 4=E ...
   * @param totalItems  total items on the exam — must match what examPdfService used
   *                    (column break = Math.ceil(totalItems / 2))
   */
  bubbleCenter(itemNumber: number, choiceIndex: number, totalItems: number): { x: number; y: number } {
    const itemsInCol1 = Math.ceil(totalItems / 2);
    const col = itemNumber <= itemsInCol1 ? 1 : 2;
    const rowInCol = col === 1 ? itemNumber - 1 : itemNumber - itemsInCol1 - 1;
    const baseX = col === 1 ? this.COL1_FIRST_BUBBLE_X : this.COL2_FIRST_BUBBLE_X;
    return {
      x: baseX + choiceIndex * this.CHOICE_SPACING,
      y: this.GRID_START_Y + rowInCol * this.ROW_H,
    };
  },
} as const;
