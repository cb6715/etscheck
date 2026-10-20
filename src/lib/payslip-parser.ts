// Fixed regex patterns calibrated against a real Danløn-format payslip's
// Tekst/Grundlag/Sats/Udbetalt/Trukket row layout. Plain code, no AI/LLM
// call — each pattern requires the SPECIFIC shape that row takes on this
// format (how many numbers, in what order), so a differently laid-out
// payslip simply won't match, correctly yielding null rather than picking
// up some other row's unrelated number by accident.
//
// Deliberately NOT a "use server" file: these are pure functions with no
// DB/auth/storage access, kept separate so they're plainly testable (see
// payslip-parser.test.ts) and never become an implicit public RPC the way
// every export from a "use server" file does.

export type ExtractedPayslipFields = {
  taxRatePct: number | null;
  amBidragPct: number | null;
  monthlyTaxDeduction: number | null;
  atpRatePerHour: number | null;
  hourlyRate: number | null;
  grossAmount: number | null;
  netAmount: number | null;
  notes: string | null;
};

// Danish number formatting: "." is the thousands separator, "," is the
// decimal point — "5.105,00" is 5105, not 5.105 or 5105.00 misread as
// English.
export function parseDanishNumber(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

export function parsePayslipText(text: string): ExtractedPayslipFields {
  const notes: string[] = [];

  // "A-skat (Fradrag: 5.105,00) 20.337,00 44% 8.948,00" — the fradrag
  // parenthetical is optional (not every payslip shows it inline), the
  // trailing "%" after the Sats number is what anchors this to the TAX
  // row specifically, so it never matches the later plain
  // "A-skat 1.404,00" line (feriepenge section, no rate shown).
  const taxMatch = text.match(/^A-skat(?:\s*\(Fradrag:\s*([\d.,]+)\))?\s+[\d.,]+\s+([\d.,]+)\s*%/m);
  const taxRatePct = taxMatch ? parseDanishNumber(taxMatch[2]) : null;
  const monthlyTaxDeduction = taxMatch?.[1] ? parseDanishNumber(taxMatch[1]) : null;

  // "AM-bidrag 27.654,00 8% 2.212,00" — same anchor-on-"%" reasoning
  // excludes the later "Samlet AM-bidrag" year-to-date line, which has
  // no rate column at all.
  const amMatch = text.match(/^AM-bidrag\s+[\d.,]+\s+([\d.,]+)\s*%/m);
  const amBidragPct = amMatch ? parseDanishNumber(amMatch[1]) : null;

  // "ATP af løn 153,50 99,00" — exactly two numbers (hours, then the kr
  // actually deducted); dividing gives a real per-hour rate rather than
  // the flat periodic ATP amount the payslip itself shows.
  const atpMatch = text.match(/^ATP af løn\s+([\d.,]+)\s+([\d.,]+)\s*$/m);
  let atpRatePerHour: number | null = null;
  if (atpMatch) {
    const hours = parseDanishNumber(atpMatch[1]);
    const kr = parseDanishNumber(atpMatch[2]);
    if (hours > 0) {
      atpRatePerHour = Math.round((kr / hours) * 100) / 100;
      notes.push(`ATP beregnet fra ${atpMatch[2]} kr / ${atpMatch[1]} timer.`);
    }
  }

  // "Timeløn 129,00 165,00 21.285,00" — Grundlag (hours), Sats (rate),
  // Udbetalt (amount); the rate is the middle number.
  const hourlyMatch = text.match(/^Timeløn\s+[\d.,]+\s+([\d.,]+)\s+[\d.,]+/m);
  const hourlyRate = hourlyMatch ? parseDanishNumber(hourlyMatch[1]) : null;

  const netMatch = text.match(/^Til udbetaling\s+([\d.,]+)/m);
  const netAmount = netMatch ? parseDanishNumber(netMatch[1]) : null;

  // "AM-indkomst 27.654,00" (single number, this period's figure) vs. the
  // later "AM-indkomst 31.123,13 48.351,19" (year-to-date, two numbers) —
  // the end-of-line anchor after exactly one number picks only the first.
  const grossMatch = text.match(/^AM-indkomst\s+([\d.,]+)\s*$/m);
  const grossAmount = grossMatch ? parseDanishNumber(grossMatch[1]) : null;

  return {
    taxRatePct,
    amBidragPct,
    monthlyTaxDeduction,
    atpRatePerHour,
    hourlyRate,
    grossAmount,
    netAmount,
    notes: notes.length > 0 ? notes.join(" ") : null,
  };
}
