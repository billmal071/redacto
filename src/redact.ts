export interface Entity { type: string; value: string }

/** Replace each entity value with [TYPE_n]; same value reuses the same token. */
export function applyRedaction(text: string, entities: Entity[]) {
  const map: Record<string, string> = {};
  const byValue = new Map<string, string>();
  const counts: Record<string, number> = {};
  // longest first so "Alex Example" wins over "Alex"; skip empty and hallucinated values
  const sorted = [...entities]
    .filter((e) => e.value && text.includes(e.value))
    .sort((a, b) => b.value.length - a.value.length);
  for (const e of sorted) {
    if (byValue.has(e.value)) continue;
    const type = (e.type || "OTHER").toUpperCase().replace(/[^A-Z]/g, "_") || "OTHER";
    counts[type] = (counts[type] ?? 0) + 1;
    const tok = `[${type}_${counts[type]}]`;
    byValue.set(e.value, tok);
    map[tok] = e.value;
  }
  if (!byValue.size) return { redacted: text, map };
  // single pass over the original text so inserted tokens are never re-matched
  const re = new RegExp([...byValue.keys()].map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  return { redacted: text.replace(re, (m) => byValue.get(m)!), map };
}
