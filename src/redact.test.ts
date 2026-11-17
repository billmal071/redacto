import { describe, expect, it } from "vitest";
import { applyRedaction } from "./redact";
import { rehydrate } from "./rehydrate";

describe("applyRedaction", () => {
  it("tokenizes and round-trips", () => {
    const text = "Alex Example (alex@example.test) paid. Contact Alex Example again.";
    const { redacted, map } = applyRedaction(text, [
      { type: "person", value: "Alex Example" },
      { type: "email", value: "alex@example.test" },
    ]);
    expect(redacted).toBe("[PERSON_1] ([EMAIL_1]) paid. Contact [PERSON_1] again.");
    expect(rehydrate(redacted, map)).toBe(text);
  });
  it("longest value wins over its substring", () => {
    const { redacted } = applyRedaction("Alex Example and Alex", [
      { type: "person", value: "Alex" },
      { type: "person", value: "Alex Example" },
    ]);
    expect(redacted).toBe("[PERSON_1] and [PERSON_2]");
  });
  it("skips hallucinated and empty values", () => {
    const { redacted, map } = applyRedaction("hello", [
      { type: "person", value: "Nobody" },
      { type: "person", value: "" },
    ]);
    expect(redacted).toBe("hello");
    expect(map).toEqual({});
  });
  it("same value with two types reuses the first token", () => {
    const { map } = applyRedaction("4111", [
      { type: "card", value: "4111" },
      { type: "account", value: "4111" },
    ]);
    expect(Object.keys(map)).toHaveLength(1);
  });
  it("does not corrupt earlier tokens when a later value matches token text", () => {
    const text = "Alex Example said PERSON";
    const { redacted, map } = applyRedaction(text, [
      { type: "person", value: "Alex Example" },
      { type: "other", value: "PERSON" },
    ]);
    expect(rehydrate(redacted, map)).toBe(text);
  });
});
