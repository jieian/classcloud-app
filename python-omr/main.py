"""
OMR Scanner Service — FastAPI + OpenCV
Receives an answer sheet image, detects bubbles, returns answers as JSON.
Layout constants must stay in sync with omrLayout.ts.
"""

import base64
import math

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ── Layout constants (must match omrLayout.ts) ────────────────────────────────

PAGE_W = 595
PAGE_H = 842

CM_SIZE = 24
CM_TL = (40,  40)
CM_TR = (531, 40)
CM_BL = (40,  778)
CM_BR = (531, 778)

CM_TL_C = (CM_TL[0] + CM_SIZE / 2, CM_TL[1] + CM_SIZE / 2)
CM_TR_C = (CM_TR[0] + CM_SIZE / 2, CM_TR[1] + CM_SIZE / 2)
CM_BL_C = (CM_BL[0] + CM_SIZE / 2, CM_BL[1] + CM_SIZE / 2)
CM_BR_C = (CM_BR[0] + CM_SIZE / 2, CM_BR[1] + CM_SIZE / 2)

BUBBLE_R        = 8
ROW_H           = 22
CHOICE_SPACING  = 25
GRID_START_Y    = 195
COL1_FIRST_BUBBLE_X = 82
COL2_FIRST_BUBBLE_X = 345

WARP_SCALE  = 1    # warp directly to PAGE_W × PAGE_H (no upscaling)
MAX_SCAN_PX = 1500


def bubble_center(item: int, choice_idx: int, total_items: int) -> tuple[float, float]:
    """Column split = Math.ceil(total_items / 2) — must match examPdfService.ts."""
    items_in_col1 = math.ceil(total_items / 2)
    col = 1 if item <= items_in_col1 else 2
    row = (item - 1) if col == 1 else (item - items_in_col1 - 1)
    first_x = COL1_FIRST_BUBBLE_X if col == 1 else COL2_FIRST_BUBBLE_X
    return (
        first_x + choice_idx * CHOICE_SPACING,
        GRID_START_Y + row * ROW_H,
    )


# ── Image helpers ─────────────────────────────────────────────────────────────

def scale_down(img: np.ndarray, max_px: int) -> np.ndarray:
    h, w = img.shape[:2]
    longest = max(w, h)
    if longest <= max_px:
        return img
    s = max_px / longest
    return cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)


def to_base64_jpeg(img_bgr: np.ndarray, quality: int = 85) -> str:
    ok, buf = cv2.imencode(".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("JPEG encode failed")
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()


# ── Corner detection ──────────────────────────────────────────────────────────

def detect_corners(gray: np.ndarray) -> list[tuple[int, int]] | None:
    H, W = gray.shape
    DARK = 80
    DENSITY_MIN = 0.55

    dark = (gray < DARK).view(np.uint8)
    integral = cv2.integral(dark.astype(np.int32))

    def dark_density(x1, y1, x2, y2) -> float:
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(W - 1, x2), min(H - 1, y2)
        if x2 < x1 or y2 < y1:
            return 0.0
        n = (integral[y2 + 1, x2 + 1]
             - integral[y1,     x2 + 1]
             - integral[y2 + 1, x1]
             + integral[y1,     x1])
        area = (x2 - x1 + 1) * (y2 - y1 + 1)
        return float(n) / area if area > 0 else 0.0

    scale_est = W / PAGE_W
    sz_min  = max(4,  int(CM_SIZE * scale_est * 0.4))
    sz_max  = int(CM_SIZE * scale_est * 2.2)
    sz_step = max(1,  int(CM_SIZE * scale_est * 0.15))
    scan_step = max(1, int(scale_est * 2.5))

    def find_marker(rx, ry, rw, rh) -> tuple[int, int] | None:
        best_d, best_x, best_y, best_sz = DENSITY_MIN, -1, -1, -1
        x_end = min(rx + rw, W)
        y_end = min(ry + rh, H)

        sz = sz_min
        while sz <= sz_max:
            y = ry
            while y + sz <= y_end:
                x = rx
                while x + sz <= x_end:
                    d = dark_density(x, y, x + sz - 1, y + sz - 1)
                    if d > best_d:
                        best_d, best_x, best_y, best_sz = d, x, y, sz
                    x += scan_step
                y += scan_step
            sz += sz_step

        if best_sz < 0:
            return None

        # Refine: centroid of very-dark pixels inside the best window
        REFINE_DARK = 70
        x1 = max(0, best_x);          x2 = min(W - 1, best_x + best_sz - 1)
        y1 = max(0, best_y);          y2 = min(H - 1, best_y + best_sz - 1)
        region = gray[y1:y2 + 1, x1:x2 + 1]
        ys, xs = np.where(region < REFINE_DARK)
        if len(xs) < 4:
            return (best_x + best_sz // 2, best_y + best_sz // 2)
        return (int(round(xs.mean() + x1)), int(round(ys.mean() + y1)))

    cw    = int(W * 0.30)
    ch    = int(H * 0.30)
    cw_tr = int(W * 0.15)   # narrow TR window to exclude QR code

    tl = find_marker(0,        0,      cw,    ch)
    tr = find_marker(W - cw_tr, 0,     cw_tr, ch)
    bl = find_marker(0,        H - ch, cw,    ch)
    br = find_marker(W - cw,   H - ch, cw,    ch)

    if not all([tl, tr, bl, br]):
        return None
    return [tl, tr, bl, br]


# ── Perspective warp ──────────────────────────────────────────────────────────

def warp_to_page(img: np.ndarray, corners: list) -> np.ndarray:
    S = WARP_SCALE
    src = np.float32(corners)
    dst = np.float32([
        [CM_TL_C[0] * S, CM_TL_C[1] * S],
        [CM_TR_C[0] * S, CM_TR_C[1] * S],
        [CM_BL_C[0] * S, CM_BL_C[1] * S],
        [CM_BR_C[0] * S, CM_BR_C[1] * S],
    ])
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(
        img, M, (PAGE_W * S, PAGE_H * S),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255),
    )


# ── Bubble sampling ───────────────────────────────────────────────────────────

def sample_gray_mean(gray: np.ndarray, cx: float, cy: float, r: float) -> float:
    """Mean raw gray value (0=black, 255=white) within 72% of bubble radius."""
    H, W = gray.shape
    inner_r = r * 0.72
    r_int = int(np.ceil(inner_r))

    y1 = max(0,     int(cy) - r_int)
    y2 = min(H - 1, int(cy) + r_int)
    x1 = max(0,     int(cx) - r_int)
    x2 = min(W - 1, int(cx) + r_int)
    if y1 > y2 or x1 > x2:
        return 255.0

    ys = np.arange(y1, y2 + 1).reshape(-1, 1)
    xs = np.arange(x1, x2 + 1).reshape(1, -1)
    mask = ((xs - cx) ** 2 + (ys - cy) ** 2) <= inner_r ** 2
    vals = gray[y1:y2 + 1, x1:x2 + 1][mask]
    return float(vals.mean()) if vals.size > 0 else 255.0


# ── Detect bubbles ────────────────────────────────────────────────────────────

def detect_bubbles(
    warped_gray: np.ndarray,
    total_items: int,
    num_choices: int,
) -> tuple[dict, dict]:
    S   = WARP_SCALE
    off = S * 2   # ±2 PDF-pt in scaled pixels
    choices = list("ABCDEFGH")[:num_choices]
    answers: dict    = {}
    confidence: dict = {}

    for item in range(1, total_items + 1):
        gray_means = []
        for ci, ch in enumerate(choices):
            cx_pt, cy_pt = bubble_center(item, ci, total_items)
            cx, cy = cx_pt * S, cy_pt * S
            r = BUBBLE_R * S
            # Take min (darkest sample) over ±2pt offsets — robust to small warp error
            g = min(
                sample_gray_mean(warped_gray, cx,       cy,       r),
                sample_gray_mean(warped_gray, cx + off, cy,       r),
                sample_gray_mean(warped_gray, cx - off, cy,       r),
                sample_gray_mean(warped_gray, cx,       cy + off, r),
                sample_gray_mean(warped_gray, cx,       cy - off, r),
            )
            gray_means.append((ch, g))

        # Lightest choice in this row ≈ background paper level
        bg = max(g for _, g in gray_means)

        fills = [(ch, (bg - g) / bg if bg > 0 else 0.0) for ch, g in gray_means]
        fills_sorted = sorted(fills, key=lambda x: x[1], reverse=True)

        top_fill = fills_sorted[0][1]
        delta    = top_fill - (fills_sorted[1][1] if len(fills_sorted) > 1 else 0.0)

        answers[item]    = fills_sorted[0][0] if (top_fill >= 0.07 and delta >= 0.04) else None
        confidence[item] = {ch: fill for ch, fill in fills}

    return answers, confidence


# ── Orientation quality score ─────────────────────────────────────────────────

def detection_quality(answers: dict, confidence: dict) -> float:
    score, items = 0.0, 0
    for item in confidence:
        vals = sorted(confidence[item].values(), reverse=True)
        if not vals:
            continue
        top    = vals[0]
        second = vals[1] if len(vals) > 1 else 0.0
        delta  = top - second
        score += top * 1.4 + delta * 2.2
        if answers.get(item):   score += 0.15
        if top   < 0.07:        score -= 0.20
        if delta < 0.04:        score -= 0.15
        items += 1
    return score / items if items else -1e9


# ── Debug overlay ─────────────────────────────────────────────────────────────

def build_debug_image(
    warped_bgr: np.ndarray,
    answers: dict,
    confidence: dict,
    total_items: int,
    num_choices: int,
) -> np.ndarray:
    S = WARP_SCALE
    choices = list("ABCDEFGH")[:num_choices]
    debug = warped_bgr.copy()

    for item in range(1, total_items + 1):
        for ci, ch in enumerate(choices):
            cx_pt, cy_pt = bubble_center(item, ci, total_items)
            cx = int(cx_pt * S)
            cy = int(cy_pt * S)
            r  = int(BUBBLE_R * S * 0.72)

            is_marked = answers.get(item) == ch
            color     = (0, 200, 0) if is_marked else (68, 68, 255)
            thickness = 2 if is_marked else 1

            cv2.circle(debug, (cx, cy), r, color, thickness, cv2.LINE_AA)

            pct = int((confidence.get(item, {}).get(ch, 0)) * 100)
            font_scale = max(0.3, r * 0.09)
            cv2.putText(
                debug, str(pct), (cx - r // 2, cy + r // 3),
                cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, 1, cv2.LINE_AA,
            )

    return debug


# ── Main endpoint ─────────────────────────────────────────────────────────────

@app.post("/scan")
async def scan_answer_sheet(
    file: UploadFile = File(...),
    total_items: int = Form(...),
    num_choices: int = Form(...),
):
    try:
        data = await file.read()
        arr  = np.frombuffer(data, np.uint8)
        img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            return JSONResponse(status_code=400, content={"error": "Could not decode image."})

        # Scale down + CLAHE for even lighting correction
        img_bgr  = scale_down(img_bgr, MAX_SCAN_PX)
        gray_raw = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        clahe    = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray     = clahe.apply(gray_raw)

        corners = detect_corners(gray)
        if corners is None:
            return JSONResponse(status_code=422, content={
                "error": "Could not detect corner markers. Ensure all 4 black squares are visible and the sheet is well-lit."
            })

        # Try all 8 corner-to-role assignments, pick the best orientation
        c0, c1, c2, c3 = corners
        candidates = [
            [c0, c1, c2, c3], [c3, c2, c1, c0],
            [c1, c3, c0, c2], [c2, c0, c3, c1],
            [c1, c0, c3, c2], [c2, c3, c0, c1],
            [c0, c2, c1, c3], [c3, c1, c2, c0],
        ]

        best = None
        for cand in candidates:
            try:
                warped_bgr  = warp_to_page(img_bgr, cand)
                warped_gray = clahe.apply(cv2.cvtColor(warped_bgr, cv2.COLOR_BGR2GRAY))
                ans, conf   = detect_bubbles(warped_gray, total_items, num_choices)
                q           = detection_quality(ans, conf)
                if best is None or q > best["quality"]:
                    best = {"quality": q, "corners": cand,
                            "answers": ans, "confidence": conf,
                            "warped_bgr": warped_bgr, "warped_gray": warped_gray}
            except Exception:
                continue

        if best is None:
            return JSONResponse(status_code=422, content={
                "error": "Failed to process scan. Retake the photo with better lighting."
            })

        debug_bgr      = build_debug_image(best["warped_bgr"], best["answers"],
                                           best["confidence"], total_items, num_choices)
        warped_data_url = to_base64_jpeg(best["warped_bgr"])
        debug_data_url  = to_base64_jpeg(debug_bgr)

        corners_out = [{"x": float(c[0]), "y": float(c[1])} for c in best["corners"]]
        answers_out = {str(k): v for k, v in best["answers"].items()}

        return {
            "answers":             answers_out,
            "cornersAutoDetected": True,
            "corners":             corners_out,
            "warpedDataUrl":       warped_data_url,
            "debugDataUrl":        debug_data_url,
        }

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/health")
async def health():
    return {"status": "ok"}
