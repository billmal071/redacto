import { describe, expect, it } from "vitest";
import { rehydrate } from "./rehydrate";

describe("rehydrate", () => {
  const map = { "[PERSON_1]": "Alex Example", "[EMAIL_1]": "alex@example.test" };

  it("replaces tokens from the local map", () => {
    expect(rehydrate("Dear [PERSON_1], we wrote to [EMAIL_1].", map)).toBe(
      "Dear Alex Example, we wrote to alex@example.test.",
    );
  });
  it("replaces repeated tokens", () => {
    expect(rehydrate("[PERSON_1] and [PERSON_1]", map)).toBe("Alex Example and Alex Example");
  });
  it("leaves unknown tokens untouched", () => {
    expect(rehydrate("[PERSON_9]", map)).toBe("[PERSON_9]");
  });
  it("does not re-expand values that look like tokens", () => {
    expect(rehydrate("[A_1]", { "[A_1]": "[B_1]", "[B_1]": "x" })).toBe("[B_1]");
  });
  it("handles empty input", () => {
    expect(rehydrate("", map)).toBe("");
  });
});
