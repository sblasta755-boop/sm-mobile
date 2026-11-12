import { screenForIncomingLink } from "./deepLinks";

test("a web link to a notice opens that notice, for staff and for managers", () => {
  expect(screenForIncomingLink("https://app.example.com/mobile/noticeboard?notice=notice-abc")).toBe("/notice/notice-abc");
  expect(screenForIncomingLink("https://app.example.com/noticeboard?notice=notice-abc")).toBe("/notice/notice-abc");
  expect(screenForIncomingLink("/mobile/noticeboard?notice=a%2Fb")).toBe("/notice/a%2Fb");
});

test("a web link to the board opens the board", () => {
  expect(screenForIncomingLink("https://app.example.com/mobile/noticeboard")).toBe("/noticeboard");
  expect(screenForIncomingLink("https://app.example.com/noticeboard/")).toBe("/noticeboard");
});

test("the app's own scheme works the same, and other links are left alone", () => {
  expect(screenForIncomingLink("smartclean://noticeboard?notice=n1")).toBe("/notice/n1");
  expect(screenForIncomingLink("/leave")).toBe("/leave");
  expect(screenForIncomingLink("https://app.example.com/tasks/9")).toBe("https://app.example.com/tasks/9");
});
