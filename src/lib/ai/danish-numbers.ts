const WORDS: Record<string, number> = {
  nul: 0,
  en: 1,
  et: 1,
  én: 1,
  ét: 1,
  to: 2,
  tre: 3,
  fire: 4,
  fem: 5,
  seks: 6,
  syv: 7,
  otte: 8,
  ni: 9,
  ti: 10,
  elleve: 11,
  tolv: 12,
  tretten: 13,
  fjorten: 14,
  femten: 15,
  seksten: 16,
  sytten: 17,
  atten: 18,
  nitten: 19,
  tyve: 20,
  enogtyve: 21,
  toogtyve: 22,
  treogtyve: 23,
  fireogtyve: 24,
  femogtyve: 25,
  tredive: 30,
  fyrre: 40,
  halvtreds: 50,
};

// ordinal words we treat as "the last N" markers, not counts
export const ORDINAL_WORDS = ["sidste", "sidste to", "de to sidste", "de sidste"];

export function wordToNumber(word: string): number | null {
  const w = word.toLowerCase().trim();
  return w in WORDS ? WORDS[w] : null;
}

const NUMBER_WORD_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(${Object.keys(WORDS).sort((a, b) => b.length - a.length).join("|")})(?![\\p{L}\\p{N}])`,
  "iu"
);

/**
 * Finds the first number in a phrase, checking digits before number-words.
 */
export function extractNumber(text: string): number | null {
  const digitMatch = text.match(/\d+/);
  if (digitMatch) return parseInt(digitMatch[0], 10);

  const wordMatch = text.match(NUMBER_WORD_PATTERN);
  if (wordMatch) return wordToNumber(wordMatch[1]);

  return null;
}

/**
 * Finds all (number, index) occurrences in a text, digits and words combined,
 * in left-to-right order, for messages that mention multiple counts.
 */
export function extractAllNumbers(text: string): { value: number; index: number }[] {
  const results: { value: number; index: number }[] = [];
  const digitRe = /\d+/g;
  let m: RegExpExecArray | null;
  while ((m = digitRe.exec(text))) {
    results.push({ value: parseInt(m[0], 10), index: m.index });
  }
  const wordRe = new RegExp(NUMBER_WORD_PATTERN.source, "giu");
  while ((m = wordRe.exec(text))) {
    const value = wordToNumber(m[1]);
    if (value !== null) results.push({ value, index: m.index });
  }
  return results.sort((a, b) => a.index - b.index);
}
