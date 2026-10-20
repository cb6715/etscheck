import { describe, it, expect } from "vitest";
import { parsePayslipText, parseDanishNumber } from "./payslip-parser";

// Exact text layer extracted (via pdf-parse) from a real Danløn payslip —
// not a hand-written fixture. Locks the calibration in against the
// genuine row shapes that format produces, including the fradrag amount
// embedded inside the A-skat row's own label text.
const REAL_DANLON_TEXT = `Danløn - www.danlon.dk
Lønsedlen er altid ved hånden med Danløn appen
Hent den i Google Play eller App Store
Side 1
Tekst Grundlag Sats Udbetalt Trukket
Leveret til e-Boks
ESBJERG TRAILERSERVICE ApS
Måde Industrivej 14
6705 Esbjerg Ø
CVR: 21070343
Cornelius Bostok
Ulvevej 54, 2. th
6715 Esbjerg N
CPR-nummer:
Lønperiode:
Medarbejdernummer:
Dispositionsdag:
Konto:
Afregningsnummer:
2907981633
01.09.2026 - 30.09.2026
84
30.09.2026
6695 - 2001346108
133
Timeløn 129,00 165,00 21.285,00
Overtidstimer 24,50 264,00 6.468,00
ATP af løn 153,50 99,00
AM-indkomst 27.654,00
AM-bidrag 27.654,00 8% 2.212,00
A-skat (Fradrag: 5.105,00) 20.337,00 44% 8.948,00
A/conto løn 1,00 2.500,00 2.500,00
Til udbetaling 13.994,00
Optjente feriedage 2026 2,08 2,08
Feriedage til afholdelse til og med 31.12.2026 1,89
Feriedage til afholdelse til og med 31.12.2027 2,08
Afholdte feriedage 0,00
Optjente nettoferiepenge 2026 1.787,13 1.787,13
Ferieberettigende løn 2026 27.753,00 27.753,00
Feriepenge brutto 3.469,13
AM-bidrag 278,00
A-skat 1.404,00
Feriepenge netto 1.787,13
AM-indkomst 31.123,13 48.351,19
Samlet A-skat 10.352,00 15.332,00
Samlet AM-bidrag 2.490,00 3.869,00
ATP 99,00 165,00
Timer 153,50 250,25
Optjent SH 971,36 1.509,40
Ferieregnskab Perioden Ferieår til dato Ferieregnskab Udbetalt Trukket
Saldo Perioden År til dato Saldo Perioden År til dato

-- 1 of 1 --
`;

describe("parseDanishNumber", () => {
  it("treats . as thousands separator and , as decimal point", () => {
    expect(parseDanishNumber("5.105,00")).toBe(5105);
    expect(parseDanishNumber("153,50")).toBe(153.5);
    expect(parseDanishNumber("8")).toBe(8);
  });
});

describe("parsePayslipText — real Danløn payslip", () => {
  const fields = parsePayslipText(REAL_DANLON_TEXT);

  it("reads the tax rate from the A-skat row's Sats column", () => {
    expect(fields.taxRatePct).toBe(44);
  });

  it("reads the monthly deduction embedded in the A-skat row's own label", () => {
    expect(fields.monthlyTaxDeduction).toBe(5105);
  });

  it("reads AM-bidrag %, not the later Samlet AM-bidrag year-to-date line", () => {
    expect(fields.amBidragPct).toBe(8);
  });

  it("computes ATP kr/hour from the ATP af løn row's hours and kr", () => {
    expect(fields.atpRatePerHour).toBeCloseTo(0.64, 2);
    expect(fields.notes).toContain("99,00 kr / 153,50 timer");
  });

  it("reads the hourly rate from the Timeløn row's Sats column", () => {
    expect(fields.hourlyRate).toBe(165);
  });

  it("reads the net amount from Til udbetaling", () => {
    expect(fields.netAmount).toBe(13994);
  });

  it("reads this period's AM-indkomst, not the year-to-date one", () => {
    expect(fields.grossAmount).toBe(27654);
  });
});

describe("parsePayslipText — unrecognized layout", () => {
  it("returns all nulls rather than guessing", () => {
    const fields = parsePayslipText("Dette er ikke en lønseddel, bare noget tilfældig tekst.");
    expect(fields.taxRatePct).toBeNull();
    expect(fields.amBidragPct).toBeNull();
    expect(fields.monthlyTaxDeduction).toBeNull();
    expect(fields.atpRatePerHour).toBeNull();
    expect(fields.hourlyRate).toBeNull();
    expect(fields.grossAmount).toBeNull();
    expect(fields.netAmount).toBeNull();
  });
});
