/**
 * examPdfService.ts
 *
 * Generates a machine-readable OMR answer sheet PDF using jsPDF.
 * Layout coordinates are driven entirely by OMR constants from omrLayout.ts,
 * so the scanner knows exactly where to look for bubbles after perspective correction.
 *
 * Usage:
 *   const pdf = await generateAnswerSheetPdf(exam, sectionName);
 *   pdf.save('AnswerSheet.pdf');
 */

import jsPDF from 'jspdf';
import { OMR } from '@/lib/omrLayout';
import type { ExamWithRelations } from '@/lib/exam-supabase';
import { getExamChoiceLetters, resolveExamParams } from '@/lib/exam-supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnswerSheetOptions {
  exam: ExamWithRelations;
  sectionName?: string;
  generatedBy?: string;
}

// ─── QR Code Helper ───────────────────────────────────────────────────────────

async function generateQrDataUrl(text: string, sizePx: number): Promise<string> {
  // Dynamically import qrcode to avoid SSR issues
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(text, {
    width: sizePx,
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}

function drawSectionBanner(pdf: jsPDF, x: number, y: number, w: number, h: number, label: string): void {
  // Outer bordered box
  pdf.setDrawColor(60, 60, 60);
  pdf.setLineWidth(0.6);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, w, h, 2, 2, 'S');

  // Black banner label sitting on the top border
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  const textW = pdf.getTextWidth(label);
  const padX = 5;
  const bannerW = textW + padX * 2;
  const bannerH = 9;
  const bannerX = x + 8;
  const bannerY = y - bannerH / 2;

  pdf.setFillColor(0, 0, 0);
  pdf.rect(bannerX, bannerY, bannerW, bannerH, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.text(label, bannerX + padX, bannerY + bannerH - 2.5);
}

function drawInstructionsBox(pdf: jsPDF, x: number, y: number, w: number, h: number): void {
  drawSectionBanner(pdf, x, y, w, h, 'INSTRUCTIONS');

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(45, 45, 45);

  const colSplitX = x + w / 2 + 2;
  const lineY1 = y + 13;
  const lineY2 = y + 22;

  pdf.text('Use a dark pen or pencil.', x + 8, lineY1);
  pdf.text('Choose only one answer.', x + 8, lineY2);
  pdf.text('Fill the circle completely.', colSplitX, lineY1);
}

function drawShadingGuideBox(pdf: jsPDF, x: number, y: number, w: number, h: number): void {
  drawSectionBanner(pdf, x, y, w, h, 'SHADING GUIDE');

  const iconY = y + h / 2 + 1;
  const r = 3.1;

  // 6 icons: 1 OK + 5 Wrong, distributed across the inner width
  const innerLeft = x + 8;
  const innerRight = x + w - 6;
  const span = innerRight - innerLeft;
  const slotW = span / 6;
  const iconXs: number[] = [];
  for (let i = 0; i < 6; i++) iconXs.push(innerLeft + slotW * i + 4);

  pdf.setLineWidth(0.5);

  // 1) OK — fully shaded bubble
  pdf.setDrawColor(70, 70, 70);
  pdf.setFillColor(0, 0, 0);
  pdf.circle(iconXs[0], iconY, r, 'F');

  // 2) Wrong — empty circle with check mark
  pdf.setFillColor(255, 255, 255);
  pdf.circle(iconXs[1], iconY, r, 'FD');
  pdf.setDrawColor(60, 60, 60);
  pdf.line(iconXs[1] - 1.5, iconY + 0.2, iconXs[1] - 0.4, iconY + 1.5);
  pdf.line(iconXs[1] - 0.4, iconY + 1.5, iconXs[1] + 1.8, iconY - 1.6);

  // 3) Wrong — empty circle with X
  pdf.setFillColor(255, 255, 255);
  pdf.circle(iconXs[2], iconY, r, 'S');
  pdf.line(iconXs[2] - 1.6, iconY - 1.6, iconXs[2] + 1.6, iconY + 1.6);
  pdf.line(iconXs[2] - 1.6, iconY + 1.6, iconXs[2] + 1.6, iconY - 1.6);

  // 4) Wrong — empty circle with single slash
  pdf.setFillColor(255, 255, 255);
  pdf.circle(iconXs[3], iconY, r, 'S');
  pdf.line(iconXs[3] + 1.7, iconY - 1.7, iconXs[3] - 1.7, iconY + 1.7);

  // 5) Wrong — partial / off-center small fill
  pdf.setFillColor(255, 255, 255);
  pdf.circle(iconXs[4], iconY, r, 'FD');
  pdf.setFillColor(0, 0, 0);
  pdf.circle(iconXs[4], iconY, r * 0.45, 'F');

  // 6) Wrong — empty circle
  pdf.setFillColor(255, 255, 255);
  pdf.circle(iconXs[5], iconY, r, 'FD');

  // Labels next to each icon
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(5.6);
  pdf.setTextColor(60, 60, 60);
  const labels = ['OK', 'Wrong', 'Wrong', 'Wrong', 'Wrong', 'Wrong'];
  for (let i = 0; i < 6; i++) {
    pdf.text(labels[i], iconXs[i] + r + 1.5, iconY + 1.8);
  }
}

// ─── Main Generator ───────────────────────────────────────────────────────────

export async function generateAnswerSheetPdf(opts: AnswerSheetOptions): Promise<jsPDF> {
  const { exam, sectionName, generatedBy } = opts;
  const pdf = new jsPDF({
    unit: 'pt',
    format: [OMR.PAGE_W, OMR.PAGE_H],
    orientation: 'portrait',
  });

  const { totalItems, numChoices } = resolveExamParams(exam);
  const choices = getExamChoiceLetters(numChoices);

  // ── Corner Markers ────────────────────────────────────────────────────────
  // Four solid black squares at exact corner positions for perspective detection
  pdf.setFillColor(0, 0, 0);
  const { CM_SIZE, CM_TL, CM_TR, CM_BL, CM_BR } = OMR;

  pdf.rect(CM_TL.x, CM_TL.y, CM_SIZE, CM_SIZE, 'F');
  pdf.rect(CM_TR.x, CM_TR.y, CM_SIZE, CM_SIZE, 'F');
  pdf.rect(CM_BL.x, CM_BL.y, CM_SIZE, CM_SIZE, 'F');

  // Bottom-right marker is also full-square to keep geometric center stable.
  pdf.rect(CM_BR.x, CM_BR.y, CM_SIZE, CM_SIZE, 'F');

  // ── QR Code ───────────────────────────────────────────────────────────────
  const qrData = `EXAM:${exam.exam_id}|ITEMS:${totalItems}|CHOICES:${numChoices}`;
  try {
    const qrUrl = await generateQrDataUrl(qrData, 150);
    pdf.addImage(qrUrl, 'PNG', OMR.QR_X, OMR.QR_Y, OMR.QR_SIZE, OMR.QR_SIZE);
  } catch {
    // Fallback: print exam ID as text
    pdf.setFontSize(8);
    pdf.text(`ID:${exam.exam_id}`, OMR.QR_X + 4, OMR.QR_Y + 36);
  }

  // ── Header ────────────────────────────────────────────────────────────────
  pdf.setFillColor(0, 0, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('ANSWER SHEET', OMR.PAGE_W / 2, 50, { align: 'center' });

  pdf.setFontSize(11);
  pdf.text(exam.title, OMR.PAGE_W / 2, 66, { align: 'center' });

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  const subjectText = exam.curriculum_subjects?.subjects?.name ? `Subject: ${exam.curriculum_subjects.subjects.name}` : '';
  const quarterText = exam.quarters?.name ? `  |  ${exam.quarters.name}` : '';
  pdf.text(subjectText + quarterText, OMR.PAGE_W / 2, 80, { align: 'center' });

  // Student info lines — pushed below QR bottom edge (QR ends at y≈110)
  const lineY1 = 118;
  const lineY2 = 138;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('STUDENT NAME:', 55, lineY1);
  pdf.setFont('helvetica', 'normal');
  pdf.line(145, lineY1, 540, lineY1);  // full width — no LRN

  pdf.setFont('helvetica', 'bold');
  pdf.text('SECTION:', 55, lineY2);
  pdf.setFont('helvetica', 'normal');
  pdf.line(97, lineY2, 185, lineY2);
  const sName = sectionName ?? exam.exam_assignments?.[0]?.sections?.name ?? '___';
  pdf.text(sName, 100, lineY2 - 2);

  const gradeLabel = exam.exam_assignments?.[0]?.sections?.grade_levels?.display_name ?? '';
  pdf.setFont('helvetica', 'bold');
  pdf.text('GRADE LEVEL:', 192, lineY2);
  pdf.setFont('helvetica', 'normal');
  pdf.line(258, lineY2, 368, lineY2);
  if (gradeLabel) pdf.text(gradeLabel, 261, lineY2 - 2);

  pdf.setFont('helvetica', 'bold');
  pdf.text('DATE:', 375, lineY2);
  pdf.setFont('helvetica', 'normal');
  pdf.line(398, lineY2, 540, lineY2);

  // Side-by-side INSTRUCTIONS and SHADING GUIDE boxes — must clear separator at y=176
  // boxY=147 → box bottom at 173, leaving a 3pt gap before the separator
  const boxY = 147;
  const boxH = 26;
  const leftBoxX = 50;
  const leftBoxW = 240;
  const rightBoxX = 300;
  const rightBoxW = 245;

  drawInstructionsBox(pdf, leftBoxX, boxY, leftBoxW, boxH);
  drawShadingGuideBox(pdf, rightBoxX, boxY, rightBoxW, boxH);

  // Separator line — sits below both boxes (box bottom = 173, separator at 176)
  pdf.setLineWidth(0.8);
  pdf.setDrawColor(0, 0, 0);
  pdf.line(50, 176, OMR.PAGE_W - 50, 176);
  pdf.setLineWidth(0.3);

  // Split items evenly across 2 columns (half each)
  const itemsInCol1 = Math.ceil(totalItems / 2);

  // ── Column Headers ────────────────────────────────────────────────────────
  const headerY = OMR.GRID_START_Y - 9;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.text('#', OMR.COL1_NUM_X, headerY, { align: 'center' });
  choices.forEach((ch, i) => {
    pdf.text(ch, OMR.COL1_FIRST_BUBBLE_X + i * OMR.CHOICE_SPACING, headerY, { align: 'center' });
  });

  const itemsInCol2 = Math.max(0, totalItems - itemsInCol1);
  if (itemsInCol2 > 0) {
    pdf.text('#', OMR.COL2_NUM_X, headerY, { align: 'center' });
    choices.forEach((ch, i) => {
      pdf.text(ch, OMR.COL2_FIRST_BUBBLE_X + i * OMR.CHOICE_SPACING, headerY, { align: 'center' });
    });
  }

  // ── Bubble Grid ───────────────────────────────────────────────────────────
  pdf.setFontSize(8);
  pdf.setLineWidth(0.6);

  for (let item = 1; item <= totalItems; item++) {
    const col = item <= itemsInCol1 ? 1 : 2;
    const rowInCol = col === 1 ? item - 1 : item - itemsInCol1 - 1;
    const numX = col === 1 ? OMR.COL1_NUM_X : OMR.COL2_NUM_X;
    const firstBubbleX = col === 1 ? OMR.COL1_FIRST_BUBBLE_X : OMR.COL2_FIRST_BUBBLE_X;
    const y = OMR.GRID_START_Y + rowInCol * OMR.ROW_H;

    // Alternating row shading for readability
    if (rowInCol % 2 === 1) {
      pdf.setFillColor(248, 248, 248);
      const shadeX = col === 1 ? 45 : 308;
      const shadeW = col === 1 ? 155 : 155;
      pdf.rect(shadeX, y - OMR.BUBBLE_R - 2, shadeW, OMR.ROW_H, 'F');
    }

    // Item number
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(0, 0, 0);
    pdf.setTextColor(0, 0, 0);
    pdf.text(String(item), numX, y + 2.5, { align: 'center' });

    // Bubbles
    pdf.setFont('helvetica', 'normal');
    choices.forEach((_, ci) => {
      const bx = firstBubbleX + ci * OMR.CHOICE_SPACING;
      pdf.setDrawColor(80, 80, 80);
      pdf.setFillColor(255, 255, 255);
      pdf.circle(bx, y, OMR.BUBBLE_R, 'FD');
    });
  }

  // Separator between columns
  if (itemsInCol2 > 0) {
    pdf.setDrawColor(180, 180, 180);
    pdf.setLineWidth(0.5);
    const midX = (OMR.COL1_FIRST_BUBBLE_X + choices.length * OMR.CHOICE_SPACING + OMR.COL2_NUM_X) / 2;
    pdf.line(midX, OMR.GRID_START_Y - 15, midX, OMR.GRID_START_Y + itemsInCol1 * OMR.ROW_H + 5);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(7);
  pdf.setTextColor(150, 150, 150);
  pdf.text(`Exam ID: ${exam.exam_id}  |  Total Items: ${totalItems}  |  Generated: ${new Date().toLocaleDateString()}`, OMR.PAGE_W / 2, OMR.PAGE_H - 20, { align: 'center' });
  if (generatedBy?.trim()) {
    const preparedBy = generatedBy.trim().replace(/\s+/g, ' ').slice(0, 80);
    pdf.text(`Prepared by: ${preparedBy}`, OMR.PAGE_W / 2, OMR.PAGE_H - 11, { align: 'center' });
  }

  // Bottom border line
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.5);
  pdf.line(50, OMR.PAGE_H - 30, OMR.PAGE_W - 50, OMR.PAGE_H - 30);

  return pdf;
}
