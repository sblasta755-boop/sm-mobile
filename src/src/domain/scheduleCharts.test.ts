import { chartSvg } from "./scheduleCharts";

describe("chartSvg", () => {
  it("draws a bar per item and escapes labels", () => {
    const svg = chartSvg({
      title: "T",
      caption: "",
      type: "bars",
      unit: "h",
      items: [
        { label: "<b>x</b>", value: 4 },
        { label: "B", value: 2 },
      ],
    });
    expect(svg).toContain("&lt;b&gt;");
    expect(svg).not.toContain("<b>");
    expect(svg).toContain("4 h");
  });
  it("draws columns and nothing for no data", () => {
    const svg = chartSvg({
      title: "T",
      caption: "",
      type: "columns",
      unit: "",
      items: [{ label: "Mon", value: 3 }, { label: "Tue", value: 0 }],
    });
    expect(svg.match(/<rect /g)).toHaveLength(2);
    expect(chartSvg({ title: "T", caption: "", type: "columns", unit: "", items: [] })).toBe("");
  });
});
