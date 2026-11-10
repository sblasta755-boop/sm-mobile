import { formatNotificationTime } from "./notificationTime";

describe("formatNotificationTime", () => {
  it("shows the weekday, date and 24-hour time", () => {
    const text = formatNotificationTime(new Date(2026, 10, 7, 18, 28).toISOString());
    expect(text).toMatch(/18:28$/);
    expect(text).toContain("7");
    expect(text).not.toContain(",,");
  });
  it("pads the time and survives a bad date", () => {
    expect(formatNotificationTime(new Date(2026, 10, 7, 9, 5).toISOString())).toMatch(/09:05$/);
    expect(formatNotificationTime("nope")).toBe("");
  });
});
