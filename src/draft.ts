import { makeDraftModel } from "./firebase";
import { withRetry } from "./retry";

/** Cloud step: receives ONLY redacted text (tokens like [PERSON_NAME_1]); returns a draft with the same tokens. */
export async function draftResponse(redacted: string, tokens: string[], onRetry?: (n: number) => void): Promise<string> {
  const model = makeDraftModel();
  const res = await withRetry(
    () =>
      model.generateContent(
        `A customer is disputing a payment. The text below is their own account of it, with personal data replaced by tokens such as [PERSON_NAME_1]. ` +
          `Write the letter FROM the customer TO the payment provider's disputes team: state what is disputed and ask for a review, then add a short evidence checklist of what the customer should attach. ` +
          `Sign it with the customer's person token. Use ONLY these tokens, exactly as written: ${tokens.join(" ")}. Never invent other tokens, names, organizations or personal data; if something is unknown, leave it out or write it generically. Plain text only: no markdown, no asterisks, no headings symbols.\n\nDISPUTE:\n${redacted}`,
      ),
    { onRetry },
  );
  return tidyDraft(res.response.text());
}

/** Strip markdown the model adds despite instructions, so the letter reads cleanly as plain text. */
export function tidyDraft(s: string): string {
  return s
    .replace(/\*{3,}|_{3,}|-{3,}/g, "")
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[*-]\s+\[ \]\s*/gm, "☐ ")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Placeholders like [ORG_1] still present after re-hydration (the model made them up). */
export function unresolvedTokens(s: string): string[] {
  return [...new Set(s.match(/\[[A-Z][A-Z_]*_\d+\]/g) ?? [])];
}
