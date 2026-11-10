import { healSavedQueue, isRetryableRejection, type QueuedPhoto } from "./evidenceQueue";

const photo = (over: Partial<QueuedPhoto>): QueuedPhoto => ({
  id: "p1",
  userId: "u1",
  taskId: "t1",
  kind: "evidence",
  label: "Photo",
  localUri: "file:///p1.jpg",
  capturedAt: "2026-11-09T07:00:00Z",
  offlineOriginated: false,
  status: "queued",
  attempts: 0,
  ...over,
});

describe("isRetryableRejection", () => {
  it("treats session and connection failures as retryable, not real refusals", () => {
    expect(isRetryableRejection("Invalid authentication token")).toBe(true);
    expect(isRetryableRejection("Backend 401: {}")).toBe(true);
    expect(isRetryableRejection("Network request failed")).toBe(true);
    expect(isRetryableRejection("Photo is not a valid image")).toBe(false);
    expect(isRetryableRejection(undefined)).toBe(false);
  });
});

describe("healSavedQueue", () => {
  it("puts a photo refused only for an expired session back in line", () => {
    const [p] = healSavedQueue([photo({ status: "rejected", error: "Invalid authentication token" })]);
    expect(p.status).toBe("queued");
    expect(p.error).toBeUndefined();
  });

  it("puts a photo that was mid-upload back in line", () => {
    expect(healSavedQueue([photo({ status: "uploading" })])[0].status).toBe("queued");
  });

  it("keeps a genuine refusal rejected", () => {
    const [p] = healSavedQueue([photo({ status: "rejected", error: "Photo is not a valid image" })]);
    expect(p.status).toBe("rejected");
  });

  it("drops a rejected twin when a photo for the same slot is already waiting", () => {
    const out = healSavedQueue([
      photo({ id: "a", status: "queued" }),
      photo({ id: "b", status: "rejected", error: "Photo is not a valid image" }),
    ]);
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("collapses duplicate entries for one photo id", () => {
    expect(healSavedQueue([photo({}), photo({})])).toHaveLength(1);
  });
});
