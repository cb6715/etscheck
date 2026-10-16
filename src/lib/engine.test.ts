import { describe, it, expect } from "vitest";
import {
  computeIntervalEarnings,
  computeSickDayEarnings,
  weeklyOvertimeThresholdHours,
  breakdownForCumulative,
  netForCumulative,
  netForIncrement,
  expectedPayout,
  feriepengeForGross,
  getPayPeriodRange,
  DEFAULT_WAGE_CONFIG,
  type WageConfig,
} from "./engine";
import { zonedDateTime, copenhagenDayKey } from "./timezone";
import { startOfDay, endOfDay, getWeekRange } from "./date";

// Danish wall-clock time -> the correct UTC instant, via the same
// conversion the app itself uses — keeps these tests correct regardless of
// which timezone the machine running them happens to be in.
function dk(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return zonedDateTime(year, month, day, hour, minute);
}

const config: WageConfig = {
  ...DEFAULT_WAGE_CONFIG,
  hourlyRate: 150,
  overtimeThresholdHours: 37,
  overtimeBonusPct: 0.5,
  nightSupplement: 20,
  nightStartHour: 18,
  nightEndHour: 6,
  breakStartMinutes: 12 * 60,
  breakEndMinutes: 12 * 60 + 30,
  monthlyTaxDeduction: 5100,
  amBidragPct: 0.08,
  taxRatePct: 0.44,
  atpRatePerHour: 0.6822,
  sickPayHourlyRate: 132,
  advanceAmount: 0,
};

describe("computeIntervalEarnings — normal day shift", () => {
  it("pays a plain 08-16 shift at the base rate minus the unpaid break", () => {
    const start = dk(2026, 10, 14, 8, 0);
    const end = dk(2026, 10, 14, 16, 0);
    const { paidSeconds, grossAmount } = computeIntervalEarnings(start, end, 0, config.overtimeThresholdHours, config);
    // 8h shift - 0.5h break = 7.5h paid
    expect(paidSeconds).toBeCloseTo(7.5 * 3600, 0);
    expect(grossAmount).toBeCloseTo(7.5 * 150, 2);
  });
});

describe("computeIntervalEarnings — overtime mid-shift", () => {
  it("splits a shift that crosses the weekly threshold into normal + overtime segments without double counting", () => {
    const start = dk(2026, 10, 14, 6, 0);
    const end = dk(2026, 10, 14, 10, 0); // 4h shift, no break inside
    const priorElapsed = 7 * 3600; // 7h already elapsed this week
    const threshold = 10; // 10h threshold -> 3h of normal capacity left, then overtime for the rest
    const { paidSeconds, grossAmount } = computeIntervalEarnings(start, end, priorElapsed, threshold, config);
    expect(paidSeconds).toBeCloseTo(4 * 3600, 0);
    const expectedGross = 3 * 150 + 1 * 150 * (1 + config.overtimeBonusPct);
    expect(grossAmount).toBeCloseTo(expectedGross, 2);
  });

  it("an unpaid break still advances the overtime clock even though it earns 0 kr", () => {
    // Shift 11:30-13:00 straddles the 12:00-12:30 break. 1.5h elapsed clock time, 1h paid.
    const start = dk(2026, 10, 14, 11, 30);
    const end = dk(2026, 10, 14, 13, 0);
    const threshold = 100; // keep everything well under threshold so this isolates the break's effect
    const { paidSeconds } = computeIntervalEarnings(start, end, 0, threshold, config);
    expect(paidSeconds).toBeCloseTo(1 * 3600, 0); // 1.5h elapsed - 0.5h break = 1h paid
  });
});

describe("computeIntervalEarnings — night tillæg", () => {
  it("applies nattillæg only to the portion of the shift inside the configured night window", () => {
    // 16:00-20:00, night starts 18:00 -> 2h day + 2h night
    const start = dk(2026, 10, 14, 16, 0);
    const end = dk(2026, 10, 14, 20, 0);
    const { grossAmount } = computeIntervalEarnings(start, end, 0, 100, config);
    const expectedGross = 2 * 150 + 2 * (150 + config.nightSupplement);
    expect(grossAmount).toBeCloseTo(expectedGross, 2);
  });
});

describe("computeIntervalEarnings — shift crossing midnight", () => {
  it("correctly applies night tillæg across the day boundary without losing or duplicating seconds", () => {
    // 22:00 -> 06:00 next day. Night window 18:00-06:00 covers the whole shift.
    const start = dk(2026, 10, 14, 22, 0);
    const end = dk(2026, 10, 15, 6, 0);
    const { paidSeconds, grossAmount } = computeIntervalEarnings(start, end, 0, 100, config);
    expect(paidSeconds).toBeCloseTo(8 * 3600, 0);
    expect(grossAmount).toBeCloseTo(8 * (150 + config.nightSupplement), 2);
  });

  it("a shift crossing midnight that also crosses the overtime threshold splits correctly", () => {
    const start = dk(2026, 10, 14, 22, 0);
    const end = dk(2026, 10, 15, 6, 0); // 8h, all night
    const priorElapsed = 34 * 3600; // 34h already this week
    const threshold = 37; // 3h normal, 5h overtime
    const { grossAmount } = computeIntervalEarnings(start, end, priorElapsed, threshold, config);
    // Night tillæg is a flat kr/time addition on top of the (possibly
    // overtime-boosted) base rate, not itself multiplied by the overtime %.
    const normalNightRate = 150 + config.nightSupplement;
    const overtimeNightRate = 150 * (1 + config.overtimeBonusPct) + config.nightSupplement;
    const expectedGross = 3 * normalNightRate + 5 * overtimeNightRate;
    expect(grossAmount).toBeCloseTo(expectedGross, 2);
  });
});

describe("weeklyOvertimeThresholdHours", () => {
  it("is the full threshold at a configured 5+ day work week", () => {
    expect(weeklyOvertimeThresholdHours({ ...config, workDaysPerWeek: 5 })).toBe(37);
    expect(weeklyOvertimeThresholdHours({ ...config, workDaysPerWeek: 6 })).toBe(37);
  });
  it("pro-rates for a configured short work week, rounded", () => {
    expect(weeklyOvertimeThresholdHours({ ...config, workDaysPerWeek: 4 })).toBe(Math.round((37 / 5) * 4)); // 30
    expect(weeklyOvertimeThresholdHours({ ...config, workDaysPerWeek: 1 })).toBe(Math.round(37 / 5)); // 7
  });
  it("doesn't fluctuate with how many days happen to have been worked so far this week", () => {
    // Regression: this used to take "days worked so far this week" and
    // shrink the threshold mid-week for a front-loaded schedule (e.g. three
    // long days hitting the pro-rated cap well before the real 37t/week).
    // It's a fixed setting now, so the same config always gives the same
    // threshold, whatever day of the week it is or how many shifts exist.
    expect(weeklyOvertimeThresholdHours({ ...config, workDaysPerWeek: 5 })).toBe(37);
  });
  it("treats 0 configured days the same as 1", () => {
    expect(weeklyOvertimeThresholdHours({ ...config, workDaysPerWeek: 0 })).toBe(
      weeklyOvertimeThresholdHours({ ...config, workDaysPerWeek: 1 })
    );
  });
});

describe("computeSickDayEarnings", () => {
  it("pays the flat sick rate with no overtime/night tillæg, minus the unpaid break", () => {
    const start = dk(2026, 10, 9, 6, 30);
    const end = dk(2026, 10, 9, 16, 0); // 9.5h span - 0.5h break = 9h paid
    const { paidSeconds, grossAmount } = computeSickDayEarnings(start, end, config.sickPayHourlyRate, config);
    expect(paidSeconds).toBeCloseTo(9 * 3600, 0);
    expect(grossAmount).toBeCloseTo(9 * 132, 2);
  });
});

describe("breakdownForCumulative / netForCumulative — deduction order", () => {
  it("deducts ATP from gross before AM-bidrag, then skattefradrag, then skat — matches a calibrated payslip", () => {
    const b = breakdownForCumulative(15372.5, 103 * 3600, config);
    expect(b.gross).toBeCloseTo(15372.5, 2);
    expect(b.atp).toBeCloseTo((103 * 0.6822), 2);
    expect(b.amIncome).toBeCloseTo(15372.5 - b.atp, 2);
    expect(b.amBidrag).toBeCloseTo(b.amIncome * 0.08, 2);
    expect(b.taxableIncome).toBeCloseTo(Math.max(0, b.amIncome - b.amBidrag - 5100), 2);
    expect(b.tax).toBeCloseTo(b.taxableIncome * 0.44, 2);
    expect(b.netto).toBeCloseTo(b.gross - b.atp - b.amBidrag - b.tax, 2);
  });

  it("clamps taxable income at 0 rather than going negative when gross is below the fradrag", () => {
    const b = breakdownForCumulative(1000, 10 * 3600, config);
    expect(b.taxableIncome).toBe(0);
    expect(b.tax).toBe(0);
  });

  it("netForCumulative matches breakdownForCumulative's netto", () => {
    expect(netForCumulative(10000, 60 * 3600, config)).toBeCloseTo(breakdownForCumulative(10000, 60 * 3600, config).netto, 6);
  });
});

describe("expectedPayout — forskud subtracted exactly once", () => {
  it("subtracts advanceAmount from netto, and only there", () => {
    const netto = netForCumulative(10000, 60 * 3600, config);
    const withAdvance = { ...config, advanceAmount: 1500 };
    expect(expectedPayout(netto, withAdvance)).toBeCloseTo(netto - 1500, 6);
    // netForCumulative itself must be unaffected by advanceAmount
    expect(netForCumulative(10000, 60 * 3600, withAdvance)).toBeCloseTo(netto, 6);
  });

  it("can go negative (more advanced than earned) without being clamped — that's real information", () => {
    const netto = 500;
    expect(expectedPayout(netto, { advanceAmount: 2000 })).toBe(-1500);
  });
});

describe("netForIncrement — telescoping consistency", () => {
  it("summing per-session increments equals the single cumulative net for the same total", () => {
    const sessions = [
      { gross: 1200, seconds: 8 * 3600 },
      { gross: 1800, seconds: 12 * 3600 },
      { gross: 900, seconds: 6 * 3600 },
    ];
    let cumulativeGross = 0;
    let cumulativeSeconds = 0;
    let summedIncrements = 0;
    for (const s of sessions) {
      summedIncrements += netForIncrement(cumulativeGross, cumulativeSeconds, s.gross, s.seconds, config);
      cumulativeGross += s.gross;
      cumulativeSeconds += s.seconds;
    }
    const totalNet = netForCumulative(cumulativeGross, cumulativeSeconds, config);
    expect(summedIncrements).toBeCloseTo(totalNet, 6);
  });

  it("forskud cancels out of every increment, even though it reduces the absolute total", () => {
    const plain = netForIncrement(1000, 10 * 3600, 2000, 10 * 3600, config);
    const withAdvance = netForIncrement(1000, 10 * 3600, 2000, 10 * 3600, { ...config, advanceAmount: 777 });
    expect(withAdvance).toBeCloseTo(plain, 6);
  });
});

describe("feriepengeForGross", () => {
  it("is calibrated against a real payslip: 15.372,50 kr brutto -> 1.921,56 kr feriepenge brutto", () => {
    const { brutto } = feriepengeForGross(15372.5, config);
    expect(brutto).toBeCloseTo(1921.5625, 2);
  });

  it("is 12.5% of gross, taxed independently of the period's skattefradrag", () => {
    const { brutto, netto } = feriepengeForGross(10000, config);
    expect(brutto).toBeCloseTo(1250, 2);
    const amBidrag = brutto * config.amBidragPct;
    const askat = (brutto - amBidrag) * config.taxRatePct;
    expect(netto).toBeCloseTo(brutto - amBidrag - askat, 6);
  });
});

describe("getPayPeriodRange", () => {
  it("end is exclusive — the instant right after the last calendar day, in Copenhagen time", () => {
    const { start, end } = getPayPeriodRange({
      payPeriodStart: new Date(2026, 7, 24),
      payPeriodEnd: new Date(2026, 8, 20),
    });
    expect(copenhagenDayKey(start)).toBe("2026-08-24");
    // the instant 1ms before `end` must still be on 2026-09-20
    expect(copenhagenDayKey(new Date(end.getTime() - 1))).toBe("2026-09-20");
    // and `end` itself must already be the next day
    expect(copenhagenDayKey(end)).toBe("2026-09-21");
  });
});

describe("date.ts day/week boundaries are Copenhagen-correct regardless of runtime TZ", () => {
  it("startOfDay/endOfDay bracket exactly the Danish calendar day, even for a shift just after Danish midnight", () => {
    // 00:30 Danish local time — this instant is still "yesterday" in UTC
    // during CEST (00:30 CEST == 22:30 UTC the day before).
    const lateNightCheckIn = dk(2026, 10, 15, 0, 30);
    const start = startOfDay(lateNightCheckIn);
    const end = endOfDay(lateNightCheckIn);
    expect(copenhagenDayKey(start)).toBe("2026-10-15");
    expect(start.getTime()).toBeLessThanOrEqual(lateNightCheckIn.getTime());
    expect(end.getTime()).toBeGreaterThan(lateNightCheckIn.getTime());
    expect(copenhagenDayKey(new Date(end.getTime()))).toBe("2026-10-15");
  });

  it("getWeekRange starts on the Danish Monday even when the reference instant is just after Danish midnight", () => {
    // Wednesday 2026-10-14, 00:15 Danish local time.
    const ref = dk(2026, 10, 14, 0, 15);
    const { start, end } = getWeekRange(ref);
    expect(copenhagenDayKey(start)).toBe("2026-10-12"); // Monday
    expect(copenhagenDayKey(new Date(end.getTime()))).toBe("2026-10-18"); // Sunday, inclusive end
    expect(start.getTime()).toBeLessThanOrEqual(ref.getTime());
    expect(end.getTime()).toBeGreaterThan(ref.getTime());
  });
});
