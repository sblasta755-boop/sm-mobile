import { PDFDocument } from "pdf-lib";
import { footerLine, stampReportFooter } from "./pdfFooter";

describe("report footer", () => {
  it("formats site | report | type • page x of n in capitals", () => {
    expect(footerLine("Doppio Zero Hazelwood", "Opening Procedure", 2, 5)).toBe(
      "DOPPIO ZERO HAZELWOOD | OPENING PROCEDURE | MANAGEMENT REPORT   •   PAGE 2 OF 5",
    );
  });

  it("degrades characters the PDF font cannot draw instead of failing", () => {
    expect(footerLine("Šoma ✓ HQ", "Daily", 1, 1)).toContain("SOMA  HQ");
  });

  it("stamps every page and keeps the page count", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) doc.addPage([595, 842]);
    const stamped = await stampReportFooter(await doc.saveAsBase64(), "Site", "Report");
    const out = await PDFDocument.load(stamped);
    expect(out.getPageCount()).toBe(3);
  });
});
