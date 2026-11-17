/** Replace [TOKEN_n] placeholders with values from a local map in a single pass. */
export function rehydrate(text: string, map: Record<string, string>): string {
  return text.replace(/\[[A-Z_]+_\d+\]/g, (t) => (Object.prototype.hasOwnProperty.call(map, t) ? map[t] : t));
}
