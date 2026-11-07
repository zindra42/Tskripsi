import "server-only";
import { generateQrMatrix } from "./qr";

// Escape string for PDF string literal ( ... )
function escapePdf(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]/g, " ");
}

export class SimplePdfDocument {
  private contentOps: string[] = [];
  public width = 595.28; // A4 width in pt
  public height = 841.89; // A4 height in pt

  // Text operation
  drawText(
    text: string,
    x: number,
    y: number,
    fontSize = 11,
    bold = false,
    align: "left" | "center" | "right" = "left",
  ) {
    const fontName = bold ? "/F2" : "/F1";
    let posX = x;
    if (align === "center") {
      const approxWidth = text.length * fontSize * 0.52;
      posX = Math.max(20, x - approxWidth / 2);
    } else if (align === "right") {
      const approxWidth = text.length * fontSize * 0.52;
      posX = Math.max(20, x - approxWidth);
    }

    const op = `BT ${fontName} ${fontSize} Tf 0 0 0 rg 1 0 0 1 ${posX.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdf(text)}) Tj ET`;
    this.contentOps.push(op);
  }

  // Draw horizontal line
  drawLine(x1: number, y1: number, x2: number, y2: number, lineWidth = 1) {
    this.contentOps.push(`q ${lineWidth.toFixed(2)} w 0 0 0 RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`);
  }

  // Draw rectangle
  drawRect(x: number, y: number, w: number, h: number, fill = false, stroke = true, fillGray = 1) {
    let op = `q 0.5 w `;
    if (fill) op += `${fillGray.toFixed(2)} g `;
    op += `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re `;
    if (fill && stroke) op += `B Q`;
    else if (fill) op += `f Q`;
    else op += `S Q`;
    this.contentOps.push(op);
  }

  // Draw Vector QR Code
  drawQrCode(text: string, x: number, y: number, targetSize = 80) {
    const matrix = generateQrMatrix(text);
    const matrixSize = matrix.length;
    const cellSize = targetSize / matrixSize;

    // Draw white background
    this.drawRect(x - 4, y - 4, targetSize + 8, targetSize + 8, true, false, 1.0);

    let qrOps = `q 0 0 0 rg `;
    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        if (matrix[r][c]) {
          const px = x + c * cellSize;
          const py = y + (matrixSize - 1 - r) * cellSize;
          qrOps += `${px.toFixed(2)} ${py.toFixed(2)} ${cellSize.toFixed(2)} ${cellSize.toFixed(2)} re `;
        }
      }
    }
    qrOps += `f Q`;
    this.contentOps.push(qrOps);
  }

  // Kop Surat UTS
  drawKopSurat() {
    this.drawText("KEMENTERIAN PENDIDIKAN TINGGI, SAINS, DAN TEKNOLOGI", 297.64, 800, 10, true, "center");
    this.drawText("UNIVERSITAS TEKNOLOGI SUMBAWA", 297.64, 786, 13, true, "center");
    this.drawText("FAKULTAS REKAYASA SISTEM", 297.64, 772, 11, true, "center");
    this.drawText("PROGRAM STUDI INFORMATIKA", 297.64, 758, 11, true, "center");
    this.drawText("Jl. Raya Olat Maras, Batu Alang, Kec. Moyo Hulu, Kab. Sumbawa, NTB", 297.64, 746, 8, false, "center");
    this.drawLine(50, 738, 545, 738, 2);
    this.drawLine(50, 735, 545, 735, 0.5);
  }

  build(): Buffer {
    const streamContent = this.contentOps.join("\n");
    const streamLen = Buffer.byteLength(streamContent, "ascii");

    const objects: string[] = [];
    const offsets: number[] = [];

    let currentOffset = 0;
    function addHeader() {
      const header = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
      currentOffset += Buffer.byteLength(header, "ascii");
      return header;
    }

    function addObject(objContent: string): string {
      offsets.push(currentOffset);
      const str = `${offsets.length} 0 obj\n${objContent}\nendobj\n`;
      currentOffset += Buffer.byteLength(str, "ascii");
      objects.push(str);
      return str;
    }

    const header = addHeader();

    // Obj 1: Catalog
    addObject("<< /Type /Catalog /Pages 2 0 R >>");
    // Obj 2: Pages
    addObject("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    // Obj 3: Page
    addObject("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>");
    // Obj 4: Content Stream
    addObject(`<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream`);
    // Obj 5: Font F1 (Helvetica)
    addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    // Obj 6: Font F2 (Helvetica-Bold)
    addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

    // XRef table
    const startXref = currentOffset;
    let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      xref += `${String(off).padStart(10, "0")} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

    const fullPdf = header + objects.join("") + xref;
    return Buffer.from(fullPdf, "latin1");
  }
}
