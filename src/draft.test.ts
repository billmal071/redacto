import { describe, expect, it } from "vitest";
import { tidyDraft } from "./draft";

describe("tidyDraft", () => {
  it("strips markdown and keeps tokens", () => {
    const raw = "**Response Letter**\n\nDear Team,\n\n***\n\n### Evidence\n* [ ] Receipt for [ACCOUNT_NUMBER_1]\n* Statement";
    const out = tidyDraft(raw);
    expect(out).not.toContain("*");
    expect(out).toContain("☐ Receipt for [ACCOUNT_NUMBER_1]");
    expect(out).toContain("• Statement");
    expect(out.startsWith("Response Letter")).toBe(true);
  });
});

import { unresolvedTokens } from "./draft";
describe("unresolvedTokens", () => {
  it("finds leftover placeholders only", () => {
    expect(unresolvedTokens("Dear Alex, re [ORGANIZATION_NAME_1] and [ORGANIZATION_NAME_1], ok [x]")).toEqual(["[ORGANIZATION_NAME_1]"]);
  });
});
