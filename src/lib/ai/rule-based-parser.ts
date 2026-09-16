import { CATEGORY_META, getCategoryMeta } from "./category-meta";
import { extractNumber, extractAllNumbers } from "./danish-numbers";
import { wordRegex } from "./regex-utils";
import type {
  BriefingAction,
  ExistingItemContext,
  ParseContext,
  ParseResult,
  ShiftValue,
} from "./briefing-types";

const DONE_VERBS = [
  "taget", "tog", "klaret", "løst", "ryddet", "ryddede", "pakket", "afsluttet",
  "sat", "lagt", "udført", "ordnet", "gjort",
];
const DONE_ADJ = ["færdig", "færdige", "klar", "klare"];
const INCREASE_VERBS = [
  "kommer", "forventer", "får", "ankommer",
  "ekstra", "extra", "mere", "yderligere", "endnu",
];
// Broad net of common Danish task-instruction verbs — used to recognize a
// clause as "something to do" even when it doesn't match a known category
// keyword, so it still becomes a plain task instead of being silently
// dropped. Deliberately wide: a false positive just adds an easily-deleted
// task, while a false negative loses the instruction entirely.
const ACTION_VERBS = [
  "skal", "pak", "pakke", "ryd", "rydde", "sæt", "sætte", "klargør", "klargøre",
  "tjek", "tjekke", "check", "tøm", "tømme", "fej", "feje", "fejning",
  "vask", "vaske", "rens", "rense", "rengør", "rengøre", "hent", "hente",
  "flyt", "flytte", "brug", "bruge", "byg", "bygge", "monter", "montere",
  "skift", "skifte", "fyld", "fylde", "kontroller", "kontrollere", "ordn", "ordne",
];
const FILLER_PREFIXES_FOR_SPLIT = /\s+((?:vi|jeg)\s+skal\s+)/gi;
const NATHOLD_WORDS = ["nathold", "natholdet", "natholdets"];
const DAGHOLD_WORDS = ["daghold", "dagholdet", "dagvagten"];
const FILLER_PREFIXES = [
  /^derudover\s+/i,
  /^desuden\s+/i,
  /^derefter\s+/i,
  /^også\s+/i,
  /^og\s+/i,
  /^vi\s+har\s+også\s+/i,
  /^skal\s+jeg\s+/i,
  /^jeg\s+skal\s+/i,
  /^vi\s+skal\s+/i,
];

// Speech-to-text often runs several "<count> <category>" items together
// with no punctuation or conjunction at all ("1 oprydning 11 trailere fra
// haven 2 paller juletræer") — split right before every
// number that isn't the clause's very first token, so each item keeps its
// own count instead of every item getting the first number in the whole
// clause. Only splits when at least 2 numbers are present.
function splitOnEmbeddedCounts(clause: string): string[] {
  const numbers = extractAllNumbers(clause);
  if (numbers.length <= 1) return [clause];

  const segments: string[] = [];
  let cursor = 0;
  for (let i = 1; i < numbers.length; i++) {
    segments.push(clause.slice(cursor, numbers[i].index).trim());
    cursor = numbers[i].index;
  }
  segments.push(clause.slice(cursor).trim());
  return segments.filter(Boolean);
}

function splitClauses(text: string): string[] {
  const sentences = text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const clauses: string[] = [];
  for (const s of sentences) {
    // People often run several instructions together without punctuation
    // ("...i dag vi skal tømme skraldespande") — treat "vi/jeg skal" as an
    // implicit clause boundary too, in addition to commas and " og ".
    const withBoundaries = s.replace(FILLER_PREFIXES_FOR_SPLIT, "|||$1");
    const parts = withBoundaries
      .split(/\s*\|\|\|\s*|\s*,\s*|\s+og\s+/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    for (const part of parts) clauses.push(...splitOnEmbeddedCounts(part));
  }
  return clauses;
}

function findEarliestCategory(clause: string): string | null {
  const lower = clause.toLowerCase();
  let best: { name: string; index: number } | null = null;
  for (const meta of CATEGORY_META) {
    for (const syn of meta.synonyms) {
      const idx = lower.search(wordRegex(syn));
      if (idx >= 0 && (!best || idx < best.index)) {
        best = { name: meta.name, index: idx };
      }
    }
  }
  return best?.name ?? null;
}

function detectShift(clause: string): { shift: ShiftValue; shiftLabel?: string } {
  const lower = clause.toLowerCase();
  if (NATHOLD_WORDS.some((w) => lower.includes(w))) return { shift: "NATHOLD" };
  if (DAGHOLD_WORDS.some((w) => lower.includes(w))) return { shift: "DAGHOLD" };
  return { shift: "DAGHOLD" };
}

function hasAny(lower: string, words: string[]): boolean {
  return words.some((w) => wordRegex(w).test(lower));
}

function isCompletionPhrase(lower: string): boolean {
  return /sidste.*(færdig|klar)|(-|\s)(er)\s+(nu\s+)?(færdig|klar)e?\b/i.test(lower) &&
    !/\d/.test(lower); // a number present usually means a specific increment, not "all done"
}

function cleanTitle(clause: string): string {
  let cleaned = clause;
  for (const re of FILLER_PREFIXES) cleaned = cleaned.replace(re, "");
  cleaned = cleaned.trim();
  if (!cleaned) return clause.trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function resolveCategory(
  explicit: string | null,
  lastMentioned: string | null,
  existingItems: ExistingItemContext[]
): { category: string | null; ambiguous: boolean; candidates: string[] } {
  if (explicit) return { category: explicit, ambiguous: false, candidates: [] };
  if (lastMentioned) return { category: lastMentioned, ambiguous: false, candidates: [] };

  const openCategories = Array.from(
    new Set(existingItems.filter((i) => i.done < i.total).map((i) => i.category))
  );
  if (openCategories.length === 1) return { category: openCategories[0], ambiguous: false, candidates: [] };
  if (openCategories.length > 1) return { category: null, ambiguous: true, candidates: openCategories };
  return { category: "På plads", ambiguous: false, candidates: [] };
}

export function parseWithRules(text: string, context: ParseContext): ParseResult {
  const clauses = splitClauses(text);
  const actions: BriefingAction[] = [];
  let lastCategory: string | null = null;
  let clarification: ParseResult["clarification"] | undefined;

  for (const clause of clauses) {
    if (clause.length < 3) continue;
    if (/^godmorgen\b/i.test(clause) && clause.split(/\s+/).length <= 2) continue;

    const lower = clause.toLowerCase();
    const explicitCategory = findEarliestCategory(clause);
    const number = extractNumber(clause);
    const isDone = hasAny(lower, DONE_VERBS);
    const isDoneAdj = hasAny(lower, DONE_ADJ);
    const isIncrease = hasAny(lower, INCREASE_VERBS);
    const { shift } = detectShift(clause);

    // "de to sidste juletræer er færdige" / "juletræerne er færdige"
    if (isCompletionPhrase(lower) || (isDoneAdj && !number)) {
      const resolved = resolveCategory(explicitCategory, lastCategory, context.existingItems);
      if (resolved.category) {
        actions.push({ type: "mark_category_complete", category: resolved.category });
        lastCategory = resolved.category;
        continue;
      }
      if (resolved.ambiguous) {
        clarification = {
          question: `Hvilken opgave er færdig? (${resolved.candidates.join(", ")})`,
          pendingAction: { kind: "increment_done" },
        };
        continue;
      }
    }

    // "de sidste 2 trailere er færdige" — a done-adjective ("færdige") with a
    // number is reporting N completions, same as a done-verb with a number;
    // previously fell through and got misread as a total-setting statement
    // (harmless no-op before create_quantity_item started overwriting an
    // existing total, actively wrong after).
    if ((isDone || isDoneAdj) && number !== null) {
      const resolved = resolveCategory(explicitCategory, lastCategory, context.existingItems);
      if (resolved.category) {
        actions.push({ type: "increment_done", category: resolved.category, delta: number, shift });
        lastCategory = resolved.category;
        continue;
      }
      if (resolved.ambiguous) {
        clarification = {
          question: `Hvilken opgave gælder de ${number}? (${resolved.candidates.join(", ")})`,
          pendingAction: { kind: "increment_done" },
        };
        continue;
      }
    }

    if (isIncrease && explicitCategory && number === null) {
      clarification = {
        question: `Hvor mange ${explicitCategory.toLowerCase()} forventer du?`,
        pendingAction: { kind: "increase_total", category: explicitCategory },
      };
      lastCategory = explicitCategory;
      continue;
    }

    if (isIncrease && number !== null) {
      const resolved = resolveCategory(explicitCategory, lastCategory, context.existingItems);
      if (resolved.category) {
        actions.push({ type: "increase_total", category: resolved.category, deltaTotal: number });
        lastCategory = resolved.category;
        continue;
      }
    }

    if (explicitCategory && number !== null) {
      actions.push({
        type: "create_quantity_item",
        category: explicitCategory,
        total: number,
        unit: getCategoryMeta(explicitCategory).unit,
      });
      lastCategory = explicitCategory;
      continue;
    }

    // An actionable instruction ("skal", "tøm", "feje", ...) becomes a
    // plain task even without a recognized category keyword — falls back
    // to "På plads" rather than being silently dropped.
    if (number === null && hasAny(lower, ACTION_VERBS)) {
      const category = explicitCategory ?? "På plads";
      actions.push({ type: "create_plain_task", title: cleanTitle(clause), category });
      lastCategory = category;
      continue;
    }

    // fully generic sentence with no recognizable verb, category or number: ignore quietly
  }

  const createCount = actions.filter(
    (a) => a.type === "create_quantity_item" || a.type === "create_plain_task"
  ).length;
  const requiresConfirmation = actions.length >= 3 && createCount >= 1;

  return {
    assistantReply: "",
    actions,
    requiresConfirmation,
    clarification,
    usedAi: false,
  };
}
