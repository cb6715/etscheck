/**
 * JS regex `\b` is ASCII-only, so it misbehaves around Danish letters
 * (æ, ø, å, é...) — e.g. `\bén\b` fails to match "én" correctly.
 * This builds a Unicode-aware "word boundary" using lookaround instead.
 */
export function wordRegex(word: string, flags = "i"): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const uFlags = flags.includes("u") ? flags : flags + "u";
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, uFlags);
}

export function wordRegexSource(word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`;
}
