import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// expo-print renders HTML through the platform's print engine, which has no
// @page margin boxes and so cannot number pages. The report's footer
// ("SITE | REPORT | MANAGEMENT REPORT • PAGE x OF n") is therefore stamped onto
// the finished PDF, where every page and the total are known.

const SLATE = rgb(0x64 / 255, 0x74 / 255, 0x8b / 255);
const SIZE = 7;
const MARGIN_X = 34; // ≈12mm, the report's side margin
const BASELINE_Y = 24; // inside the 16mm bottom margin the HTML leaves free

// Standard PDF fonts only cover Latin-1; anything else (a site called "Šoma",
// an emoji) would make drawText throw, so degrade it rather than lose the PDF.
function safe(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e•]/g, "");
}

export function footerLine(site: string, reportName: string, page: number, total: number): string {
  return safe(`${site} | ${reportName} | Management report   •   PAGE ${page} OF ${total}`).toUpperCase();
}

/** Returns the PDF (base64) with the footer drawn right-aligned on every page. */
export async function stampReportFooter(
  pdfBase64: string,
  site: string,
  reportName: string,
): Promise<string> {
  const doc = await PDFDocument.load(pdfBase64);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const text = footerLine(site, reportName, index + 1, pages.length);
    const width = font.widthOfTextAtSize(text, SIZE);
    page.drawText(text, {
      x: page.getWidth() - MARGIN_X - width,
      y: BASELINE_Y,
      size: SIZE,
      font,
      color: SLATE,
    });
  });
  return doc.saveAsBase64();
}
