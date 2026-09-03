import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';

export type AttendanceSummaryPdfInput = {
  title: string;
  employeeName: string;
  employeeCode?: string | null;
  designation?: string | null;
  department?: string | null;
  periodLabel: string;
  periodSubLabel?: string | null;
  daysCovered: number;
  metrics: Array<{
    label: string;
    value: string;
  }>;
  comparisonRows?: Array<{
    label: string;
    value: string;
  }>;
  generatedAtLabel: string;
};

export async function buildAttendanceSummaryPdf(input: AttendanceSummaryPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage(PageSizes.A4);
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Colors
  const textColor = rgb(0.1, 0.15, 0.2);
  const textMuted = rgb(0.4, 0.45, 0.5);
  const bieGreen = rgb(0.02, 0.45, 0.35); // Approx emerald-700
  const lightBg = rgb(0.96, 0.97, 0.98); // Approx slate-50
  const borderColor = rgb(0.85, 0.88, 0.90); // Approx slate-200
  const white = rgb(1, 1, 1);

  // Margins
  const margin = 40;
  let cursorY = height - margin;

  // Draw Header
  page.drawText('BIE Staff Manager', { x: margin, y: cursorY, size: 12, font: fontBold, color: bieGreen });
  cursorY -= 20;

  // Title
  page.drawText(input.title, { x: margin, y: cursorY, size: 20, font: fontBold, color: textColor });
  
  // Green accent line
  cursorY -= 15;
  page.drawLine({
    start: { x: margin, y: cursorY },
    end: { x: width - margin, y: cursorY },
    thickness: 2,
    color: bieGreen
  });

  // Wrap Text Helper
  function wrapText(text: string, maxWidth: number, font: any, size: number): string[] {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = font.widthOfTextAtSize(currentLine + " " + word, size);
      if (width < maxWidth) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  }

  // Setup columns
  const contentWidth = width - margin * 2;
  const leftColWidth = contentWidth * 0.45;
  const rightColX = margin + contentWidth * 0.55;
  const rightColWidth = contentWidth * 0.45;

  // Employee Identity Block
  cursorY -= 30;
  const headerStartY = cursorY;

  let leftY = headerStartY;
  page.drawText('Employee:', { x: margin, y: leftY, size: 10, font: fontRegular, color: textMuted });
  leftY -= 15;
  page.drawText(input.employeeName, { x: margin, y: leftY, size: 14, font: fontBold, color: textColor });
  
  leftY -= 18;
  if (input.designation) {
    page.drawText('Designation:', { x: margin, y: leftY, size: 10, font: fontRegular, color: textMuted });
    leftY -= 12;
    const desigLines = wrapText(input.designation, leftColWidth, fontBold, 10);
    for (const line of desigLines) {
      page.drawText(line, { x: margin, y: leftY, size: 10, font: fontBold, color: textColor });
      leftY -= 12;
    }
    leftY -= 4;
  }
  
  if (input.department) {
    page.drawText('Department:', { x: margin, y: leftY, size: 10, font: fontRegular, color: textMuted });
    leftY -= 12;
    const deptLines = wrapText(input.department, leftColWidth, fontBold, 10);
    for (const line of deptLines) {
      page.drawText(line, { x: margin, y: leftY, size: 10, font: fontBold, color: textColor });
      leftY -= 12;
    }
    leftY -= 4;
  }
  
  if (input.employeeCode) {
    page.drawText('Employee ID:', { x: margin, y: leftY, size: 10, font: fontRegular, color: textMuted });
    leftY -= 12;
    page.drawText(input.employeeCode, { x: margin, y: leftY, size: 10, font: fontBold, color: textColor });
    leftY -= 16;
  }

  // Period Information Block (Align Right opposite to Employee)
  let rightY = headerStartY;
  
  page.drawText('Period:', { x: rightColX, y: rightY, size: 10, font: fontRegular, color: textMuted });
  rightY -= 15;
  
  const periodLines = wrapText(input.periodLabel, rightColWidth, fontBold, 12);
  for (const line of periodLines) {
    page.drawText(line, { x: rightColX, y: rightY, size: 12, font: fontBold, color: textColor });
    rightY -= 15;
  }
  rightY -= 4;

  if (input.periodSubLabel) {
    page.drawText('Compared with:', { x: rightColX, y: rightY, size: 10, font: fontRegular, color: textMuted });
    rightY -= 12;
    const cleanSub = input.periodSubLabel.replace("Compared with ", "");
    const subLines = wrapText(cleanSub, rightColWidth, fontRegular, 10);
    for (const line of subLines) {
      page.drawText(line, { x: rightColX, y: rightY, size: 10, font: fontRegular, color: textColor });
      rightY -= 12;
    }
    rightY -= 4;
  }
  
  page.drawText('Days Covered:', { x: rightColX, y: rightY, size: 10, font: fontRegular, color: textMuted });
  rightY -= 12;
  page.drawText(String(input.daysCovered), { x: rightColX, y: rightY, size: 10, font: fontBold, color: textColor });
  rightY -= 16;

  cursorY = Math.min(leftY, rightY) - 20;

  // 8 Metrics Grid
  // Layout: 2 columns x 4 rows
  const colCount = 2;
  const rowCount = 4;
  const boxWidth = (contentWidth - (colCount - 1) * 10) / colCount;
  const boxHeight = 50;

  for (let i = 0; i < input.metrics.length; i++) {
    const metric = input.metrics[i];
    const row = Math.floor(i / colCount);
    const col = i % colCount;
    
    const boxX = margin + col * (boxWidth + 10);
    const boxY = cursorY - row * (boxHeight + 10) - boxHeight;

    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      color: lightBg,
      borderColor: borderColor,
      borderWidth: 1
    });

    page.drawText(metric.label, {
      x: boxX + 10,
      y: boxY + boxHeight - 18,
      size: 9,
      font: fontRegular,
      color: textMuted
    });

    // Fit text to available width
    const availableWidth = boxWidth - 20;
    let fontSize = 16;
    let textWidth = fontBold.widthOfTextAtSize(metric.value, fontSize);
    
    while (textWidth > availableWidth && fontSize > 12) {
      fontSize -= 1;
      textWidth = fontBold.widthOfTextAtSize(metric.value, fontSize);
    }

    page.drawText(metric.value, {
      x: boxX + 10,
      y: boxY + 14,
      size: fontSize,
      font: fontBold,
      color: textColor
    });
  }

  cursorY -= (rowCount * (boxHeight + 10)) + 30;

  // Comparison Block
  if (input.comparisonRows && input.comparisonRows.length > 0) {
    page.drawText('Previous Period Comparison', { x: margin, y: cursorY, size: 12, font: fontBold, color: textColor });
    cursorY -= 15;
    
    for (const comp of input.comparisonRows) {
      cursorY -= 10;
      
      let prevText = "";
      let currText = "";
      let changeText = comp.value; // fallback
      
      let cardBg = rgb(0.97, 0.97, 0.98); // neutral gray
      let cardBorder = borderColor;
      let changeColor = textColor;
      
      const match = comp.value.match(/^(\d+)%\s*->\s*(\d+)%\s*\(([-+]?\d+)\s*pp\)$/);
      if (match) {
        const prev = parseInt(match[1], 10);
        const curr = parseInt(match[2], 10);
        const delta = parseInt(match[3], 10);
        
        prevText = `Previous: ${prev}%`;
        currText = `Current: ${curr}%`;
        
        if (delta === 0) {
          changeText = `Change: No change (0 percentage points)`;
        } else if (delta > 0) {
          changeText = `Change: Improved by ${Math.abs(delta)} percentage points`;
          cardBg = rgb(0.95, 0.99, 0.95);
          cardBorder = rgb(0.75, 0.9, 0.75);
          changeColor = rgb(0.05, 0.5, 0.15);
        } else {
          changeText = `Change: Decreased by ${Math.abs(delta)} percentage points`;
          cardBg = rgb(0.99, 0.95, 0.95);
          cardBorder = rgb(0.95, 0.8, 0.8);
          changeColor = rgb(0.7, 0.15, 0.15);
        }
      }
      
      const cardHeight = 45;
      page.drawRectangle({
        x: margin,
        y: cursorY - cardHeight,
        width: contentWidth,
        height: cardHeight,
        color: cardBg,
        borderColor: cardBorder,
        borderWidth: 1
      });
      
      const compLabelY = cursorY - 14;
      page.drawText(comp.label, { x: margin + 12, y: compLabelY, size: 10, font: fontBold, color: textColor });
      
      const detailsY = cursorY - 28;
      if (prevText && currText) {
        page.drawText(prevText, { x: margin + 12, y: detailsY, size: 9, font: fontRegular, color: textColor });
        page.drawText(currText, { x: margin + 110, y: detailsY, size: 9, font: fontRegular, color: textColor });
        page.drawText(changeText, { x: margin + 12, y: detailsY - 12, size: 9, font: fontRegular, color: changeColor });
      } else {
        page.drawText(changeText, { x: margin + 12, y: detailsY, size: 9, font: fontRegular, color: changeColor });
      }
      
      cursorY -= cardHeight;
    }
    cursorY -= 20;
  }

  // Footer
  const footerY = margin;
  page.drawLine({
    start: { x: margin, y: footerY + 15 },
    end: { x: width - margin, y: footerY + 15 },
    thickness: 1,
    color: borderColor
  });
  page.drawText(`Generated on: ${input.generatedAtLabel}`, {
    x: margin,
    y: footerY,
    size: 9,
    font: fontRegular,
    color: textMuted
  });

  return await pdfDoc.save();
}
