import { wordRegex } from "./regex-utils";

export type CategoryMeta = {
  name: string;
  icon: string;
  unit: string;
  synonyms: string[];
};

export const CATEGORY_META: CategoryMeta[] = [
  {
    name: "Vaske",
    icon: "🚿",
    unit: "stk",
    synonyms: [
      "vaske", "vask", "vasket", "vasker", "vaskene", "vasken",
      "trailer", "trailere", "traileren", "trailerne",
    ],
  },
  { name: "Juletræer", icon: "🎄", unit: "stk", synonyms: ["juletræer", "juletræ", "juletræerne", "juletræet"] },
  { name: "Paller", icon: "📦", unit: "paller", synonyms: ["paller", "palle", "pallerne", "palletter"] },
  { name: "Kødkroge", icon: "🪝", unit: "stk", synonyms: ["kødkroge", "kødkrog", "krog", "kroge", "kødkrogene"] },
  { name: "Rengøring", icon: "🧹", unit: "stk", synonyms: ["rengøring", "fejet", "feje", "fejning"] },
  { name: "Modtagelser", icon: "📥", unit: "stk", synonyms: ["modtaget", "modtagelse", "modtagelser"] },
  { name: "Drive-in", icon: "🚗", unit: "kunder", synonyms: ["drive-in", "driveinkunder"] },
  { name: "På plads", icon: "📍", unit: "stk", synonyms: [] }, // catch-all, matched only as fallback
];

export function findCategoryByKeyword(text: string): string | null {
  const lower = text.toLowerCase();
  for (const meta of CATEGORY_META) {
    for (const syn of meta.synonyms) {
      if (wordRegex(syn).test(lower)) return meta.name;
    }
  }
  return null;
}

export function getCategoryMeta(name: string): CategoryMeta {
  return (
    CATEGORY_META.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? {
      name,
      icon: "📋",
      unit: "stk",
      synonyms: [],
    }
  );
}
