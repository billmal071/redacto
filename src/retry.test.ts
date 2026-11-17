import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry";

describe("withRetry", () => {
  it("retries a 500 then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("fetch-error: [500 ] high demand")).mockResolvedValue("ok");
    expect(await withRetry(fn, { baseMs: 1 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("does not retry a 401", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("[401 ] App Check token is invalid"));
    await expect(withRetry(fn, { baseMs: 1 })).rejects.toThrow("401");
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("gives up after the last try", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("[503 ] unavailable"));
    await expect(withRetry(fn, { tries: 3, baseMs: 1 })).rejects.toThrow("503");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
