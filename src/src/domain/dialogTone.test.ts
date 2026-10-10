import { inferTone } from "./dialogTone";

describe("dialog tone", () => {
  it("reads tone from wording and button styles", () => {
    expect(inferTone("Could not save", [{ text: "OK" }])).toBe("danger");
    expect(inferTone("Delete this?", [{ text: "Delete", style: "destructive" }])).toBe("danger");
    expect(inferTone("Approve this task?", [{ text: "Approve" }])).toBe("warning");
    expect(inferTone("Report ready", [{ text: "OK" }])).toBe("success");
    expect(inferTone("Placard link", [{ text: "OK" }])).toBe("info");
  });
});
