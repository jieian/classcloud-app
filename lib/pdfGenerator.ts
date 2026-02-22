import jsPDF from 'jspdf';

export interface AnswerSheetData {
  examName: string;
  gradeLevel: string;
  subject: string;
  section: string;
  totalQuestions: number;
}

export const generateAnswerSheet = (data: AnswerSheetData) => {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  
  // Header
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ANSWER SHEET', pageWidth / 2, 20, { align: 'center' });
  
  // Exam details
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Exam: ${data.examName}`, 20, 35);
  pdf.text(`Grade Level: ${data.gradeLevel}`, 20, 42);
  pdf.text(`Subject: ${data.subject}`, 20, 49);
  pdf.text(`Section: ${data.section}`, 20, 56);
  
  // Student info section
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.5);
  pdf.line(20, 65, pageWidth - 20, 65);
  
  pdf.setFontSize(10);
  pdf.text('Name: _________________________________', 20, 75);
  pdf.text('Date: _______________', pageWidth - 70, 75);
  
  pdf.line(20, 82, pageWidth - 20, 82);
  
  // Answer bubbles
  const startY = 95;
  const bubbleRadius = 3;
  const columnWidth = 90;
  const rowHeight = 10;
  const questionsPerColumn = 30;
  
  pdf.setFontSize(9);
  
  for (let i = 0; i < data.totalQuestions; i++) {
    const column = Math.floor(i / questionsPerColumn);
    const row = i % questionsPerColumn;
    const x = 20 + (column * columnWidth);
    const y = startY + (row * rowHeight);
    
    // Question number
    pdf.text(`${i + 1}.`, x, y + 3);
    
    // Answer bubbles A, B, C, D
    const bubbleX = x + 15;
    ['A', 'B', 'C', 'D'].forEach((letter, index) => {
      const bubbleXPos = bubbleX + (index * 12);
      pdf.circle(bubbleXPos, y, bubbleRadius);
      pdf.setFontSize(7);
      pdf.text(letter, bubbleXPos - 1.5, y + 1);
      pdf.setFontSize(9);
    });
    
    // Start new page if needed
    if ((i + 1) % (questionsPerColumn * 2) === 0 && i + 1 < data.totalQuestions) {
      pdf.addPage();
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('ANSWER SHEET (continued)', pageWidth / 2, 20, { align: 'center' });
    }
  }
  
  // Instructions at bottom
  const instructionY = pageHeight - 20;
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'italic');
  pdf.text('Instructions: Fill in the circle completely for your answer choice.', pageWidth / 2, instructionY, { align: 'center' });
  
  return pdf;
};
