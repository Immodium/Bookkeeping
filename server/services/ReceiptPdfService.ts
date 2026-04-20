import { PDFDocument, PDFImage } from 'pdf-lib';
import { promises as fs } from 'fs';
import { basename, dirname, extname, join } from 'path';

const IMAGE_MIME_SIGNATURES: Array<{ mimeType: string; matches: (bytes: Uint8Array) => boolean }> = [
  {
    mimeType: 'image/jpeg',
    matches: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  },
  {
    mimeType: 'image/png',
    matches: (bytes) =>
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
  },
  {
    mimeType: 'image/gif',
    matches: (bytes) =>
      bytes.length >= 6 &&
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38 &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) &&
      bytes[5] === 0x61
  },
  {
    mimeType: 'image/webp',
    matches: (bytes) =>
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
  }
];

const isPdf = (bytes: Uint8Array): boolean =>
  bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

const detectMimeType = (bytes: Uint8Array): string | null => {
  for (const signature of IMAGE_MIME_SIGNATURES) {
    if (signature.matches(bytes)) {
      return signature.mimeType;
    }
  }

  return null;
};

export class ReceiptPdfService {
  async ensurePdfReceipt(filePath: string): Promise<string> {
    const sourceBuffer = await fs.readFile(filePath);
    const signatureBytes = new Uint8Array(sourceBuffer.slice(0, 16));

    if (isPdf(signatureBytes)) {
      if (extname(filePath).toLowerCase() === '.pdf') {
        return filePath;
      }

      const pdfPath = `${filePath}.pdf`;
      await fs.writeFile(pdfPath, sourceBuffer);
      await fs.unlink(filePath);
      return pdfPath;
    }

    const imageMimeType = detectMimeType(signatureBytes);
    if (!imageMimeType) {
      throw new Error('Unsupported receipt file type. Only PDF and standard image formats are supported.');
    }

    const pdfPath = join(dirname(filePath), `${basename(filePath)}.pdf`);
    const pdfBytes = await this.convertImageToPdf(sourceBuffer, imageMimeType);
    await fs.writeFile(pdfPath, pdfBytes);
    await fs.unlink(filePath);
    return pdfPath;
  }

  private async convertImageToPdf(imageBuffer: Buffer, mimeType: string): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    let embeddedImage: PDFImage;

    if (mimeType === 'image/png') {
      embeddedImage = await pdfDoc.embedPng(imageBuffer);
    } else {
      embeddedImage = await pdfDoc.embedJpg(imageBuffer);
    }

    const { width, height } = embeddedImage.scale(1);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width,
      height
    });

    return pdfDoc.save();
  }
}

export const receiptPdfService = new ReceiptPdfService();

export const convertReceiptToPdfIfNeeded = async (
  filePath: string,
  originalFilename: string,
  mimeType?: string
): Promise<{ path: string; filename: string; mimeType: string }> => {
  const pdfPath = await receiptPdfService.ensurePdfReceipt(filePath);
  const normalizedFilename =
    pdfPath.split('/').pop() || `${originalFilename.replace(/\.[^.]+$/, '')}.pdf`;

  return {
    path: pdfPath,
    filename: normalizedFilename.endsWith('.pdf') ? normalizedFilename : `${normalizedFilename}.pdf`,
    mimeType: mimeType === 'application/pdf' ? mimeType : 'application/pdf'
  };
};
