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
import type { ExamWithRelations, AnswerKeyJsonb } from '@/lib/exam-supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnswerSheetOptions {
  exam: ExamWithRelations;
  sectionName?: string;
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

// ─── Main Generator ───────────────────────────────────────────────────────────

export async function generateAnswerSheetPdf(opts: AnswerSheetOptions): Promise<jsPDF> {
  const { exam, sectionName } = opts;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });

  const ak = exam.answer_key as AnswerKeyJsonb | null;
  const totalItems = ak?.total_questions ?? exam.total_items ?? 40;
  const numChoices = ak?.num_choices ?? 4;
  const choices = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, numChoices);

  // ── Corner Markers ────────────────────────────────────────────────────────
  // Four solid black squares at exact corner positions for perspective detection
  pdf.setFillColor(0, 0, 0);
  const { CM_SIZE, CM_TL, CM_TR, CM_BL, CM_BR } = OMR;

  pdf.rect(CM_TL.x, CM_TL.y, CM_SIZE, CM_SIZE, 'F');
  pdf.rect(CM_TR.x, CM_TR.y, CM_SIZE, CM_SIZE, 'F');
  pdf.rect(CM_BL.x, CM_BL.y, CM_SIZE, CM_SIZE, 'F');

  // Bottom-right: L-shaped notch (marks orientation — scanner detects this is BR)
  pdf.rect(CM_BR.x, CM_BR.y, CM_SIZE, CM_SIZE, 'F');
  const notch = Math.round(CM_SIZE * 0.4);
  pdf.setFillColor(255, 255, 255);
  pdf.rect(CM_BR.x + CM_SIZE - notch, CM_BR.y, notch, notch, 'F'); // white notch top-right of marker

  // ── QR Code ───────────────────────────────────────────────────────────────
  const qrData = `EXAM:${exam.exam_id}`;
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
  const subjectText = exam.subjects?.name ? `Subject: ${exam.subjects.name}` : '';
  const quarterText = exam.quarters?.name ? `  |  ${exam.quarters.name}` : '';
  const dateText = exam.exam_date ? `  |  Date: ${new Date(exam.exam_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` : '';
  pdf.text(subjectText + quarterText + dateText, OMR.PAGE_W / 2, 80, { align: 'center' });

  // Student info lines
  const lineY1 = 105;
  const lineY2 = 125;
  const lineY3 = 145;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('STUDENT NAME:', 55, lineY1);
  pdf.setFont('helvetica', 'normal');
  pdf.line(145, lineY1, 420, lineY1);

  pdf.setFont('helvetica', 'bold');
  pdf.text('LRN:', 430, lineY1);
  pdf.setFont('helvetica', 'normal');
  pdf.line(455, lineY1, 540, lineY1);

  pdf.setFont('helvetica', 'bold');
  pdf.text('SECTION:', 55, lineY2);
  pdf.setFont('helvetica', 'normal');
  pdf.line(100, lineY2, 280, lineY2);
  const sName = sectionName ?? exam.exam_assignments?.[0]?.sections?.name ?? '___';
  pdf.text(sName, 105, lineY2 - 2);

  pdf.setFont('helvetica', 'bold');
  pdf.text('SCORE:', 290, lineY2);
  pdf.setFont('helvetica', 'normal');
  pdf.line(325, lineY2, 430, lineY2);

  pdf.setFont('helvetica', 'bold');
  pdf.text('DATE:', 440, lineY2);
  pdf.setFont('helvetica', 'normal');
  pdf.line(465, lineY2, 540, lineY2);

  // Instructions
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(7.5);
  pdf.text(
    'INSTRUCTIONS: Use a dark pen or pencil. Shade the circle that corresponds to your answer completely. Do not make any stray marks.',
    OMR.PAGE_W / 2, lineY3, { align: 'center' }
  );

  // Separator line
  pdf.setLineWidth(0.8);
  pdf.setDrawColor(0, 0, 0);
  pdf.line(50, lineY3 + 8, OMR.PAGE_W - 50, lineY3 + 8);
  pdf.setLineWidth(0.3);

  // ── Column Headers ────────────────────────────────────────────────────────
  const headerY = OMR.GRID_START_Y - 9;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.text('#', OMR.COL1_NUM_X, headerY, { align: 'center' });
  choices.forEach((ch, i) => {
    pdf.text(ch, OMR.COL1_FIRST_BUBBLE_X + i * OMR.CHOICE_SPACING, headerY, { align: 'center' });
  });

  const itemsInCol2 = Math.max(0, totalItems - OMR.ITEMS_PER_COL);
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
    const col = item <= OMR.ITEMS_PER_COL ? 1 : 2;
    const rowInCol = col === 1 ? item - 1 : item - OMR.ITEMS_PER_COL - 1;
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
    pdf.line(midX, OMR.GRID_START_Y - 15, midX, OMR.GRID_START_Y + OMR.ITEMS_PER_COL * OMR.ROW_H + 5);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(7);
  pdf.setTextColor(150, 150, 150);
  pdf.text(`Exam ID: ${exam.exam_id}  |  Total Items: ${totalItems}  |  Generated: ${new Date().toLocaleDateString()}`, OMR.PAGE_W / 2, OMR.PAGE_H - 20, { align: 'center' });

  // Bottom border line
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.5);
  pdf.line(50, OMR.PAGE_H - 30, OMR.PAGE_W - 50, OMR.PAGE_H - 30);

  return pdf;
}
