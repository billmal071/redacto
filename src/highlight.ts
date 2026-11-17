const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Mark { cls: string; title?: string }

/** Escape text and wrap every occurrence of each needle in <mark>. Single pass, longest needle first. */
export function highlight(text: string, needles: string[], mark: (needle: string) => Mark): string {
  const list = [...new Set(needles.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!list.length) return esc(text);
  const re = new RegExp(`(${list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return text
    .split(re)
    .map((part, i) => {
      if (i % 2 === 0) return esc(part);
      const m = mark(part);
      return `<mark class="${m.cls}"${m.title ? ` title="${esc(m.title)}"` : ""}>${esc(part)}</mark>`;
    })
    .join("");
}
