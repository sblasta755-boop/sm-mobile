import type { ChartSpec } from "./scheduleAnalysis";

/** One group of rows on a report: a heading and the rows under it, all sharing the report's header. */
export interface ReportGroup {
  title: string;
  rows: string[][];
  /** A table with its own columns, for reports whose sections are different tables. Else the report's header applies. */
  header?: string[];
  /** A line under the section title, such as how the figures were worked out. */
  note?: string;
}

/** A coloured box for what a reader must not miss. */
export interface ReportCallout {
  tone: "warn" | "info";
  title: string;
  text: string;
}

/** Pictures printed in their own section, each with a caption. */
export interface ReportPhotos {
  title: string;
  items: { src: string | null; caption: string }[];
}

/**
 * Everything a printed report needs, whatever it is about: the cover figures, the written findings,
 * the charts and the table groups. Schedule and attendance reports both produce one, and the web page,
 * the phone PDF, Excel and CSV all read it, so they cannot disagree.
 */
export interface ReportDoc {
  title: string;
  /** Small label over the title and in the letterhead, such as "SCHEDULE". */
  eyebrow: string;
  period: string;
  start: string;
  end: string;
  kpis: { label: string; value: string }[];
  /** Rows under "Report details" besides site, period, location and who prepared it. */
  details: { k: string; v: string }[];
  header: string[];
  groups: ReportGroup[];
  /** Columns left out of the printed page (it is portrait A4). The files keep them. */
  hiddenColumns: number[];
  /** Plain note under the cover figures, such as how the dates were counted. */
  note: string;
  /** A short paragraph under the details, such as a management summary. */
  summary?: { title: string; text: string };
  callouts?: ReportCallout[];
  /** Evidence pictures, printed after the analysis. */
  photos?: ReportPhotos;
  insights: string[];
  charts: ChartSpec[];
  filename: string;
}

/**
 * The one flat table behind CSV and Excel: every group's rows in order. A report whose groups are different tables
 * gets a leading Section column, and each group's own column names as a line before its rows.
 */
export function flattenDoc(report: ReportDoc) {
  const mixed = report.groups.some((g) => g.header);
  if (!mixed) {
    return {
      filename: report.filename,
      title: report.title,
      header: report.header,
      rows: report.groups.flatMap((g) => g.rows),
    };
  }
  const width = Math.max(report.header.length, ...report.groups.map((g) => g.header?.length ?? 0), 1);
  const pad = (cells: string[]) => [...cells, ...Array(Math.max(0, width - cells.length)).fill("")];
  return {
    filename: report.filename,
    title: report.title,
    header: ["Section", ...Array.from({ length: width }, (_, i) => `Column ${i + 1}`)],
    rows: report.groups.flatMap((g) => [
      [g.title, ...pad(g.header ?? report.header)],
      ...g.rows.map((r) => ["", ...pad(r)]),
    ]),
  };
}
