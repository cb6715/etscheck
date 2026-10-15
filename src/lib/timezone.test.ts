import { describe, it, expect } from "vitest";
import { copenhagenWeekday, copenhagenDayKey, zonedDateTime } from "./timezone";

// Regression test for a real production bug: `getWeekAttendance` used to
// compute each day's weekday via `Date#getDay()`, which reads the weekday
// of the instant as seen in the EXECUTING RUNTIME's own timezone. On a
// UTC server, a Danish-midnight instant (e.g. Tuesday 00:00 CEST = Monday
// 22:00 UTC) still reads as "Monday" in UTC — so every single day label
// came out one weekday behind, Monday's data was filtered out entirely as
// a fake "Sunday" (isWeekend), and Friday's real hours/sick status showed
// up mislabeled as Thursday.
describe("copenhagenWeekday", () => {
  it("is correct for a Danish-midnight instant, even though the UTC calendar date is still the day before", () => {
    // Tuesday 2026-10-13 00:00 Danish local (CEST, UTC+2) = Monday 22:00 UTC.
    const tuesdayMidnightDanish = zonedDateTime(2026, 10, 13, 0, 0);
    expect(copenhagenDayKey(tuesdayMidnightDanish)).toBe("2026-10-13");
    expect(copenhagenWeekday(tuesdayMidnightDanish)).toBe(2); // Tuesday
  });

  it("matches known real-world weekdays across a full week", () => {
    // 2026-10-12 is a Monday (verified against a real calendar).
    const expected = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
    for (let i = 0; i < 7; i++) {
      const day = 12 + i;
      const d = zonedDateTime(2026, 10, day, 0, 0);
      expect(copenhagenWeekday(d)).toBe(expected[i]);
    }
  });

  it("also holds in winter (CET, UTC+1), not just summer (CEST, UTC+2)", () => {
    // 2026-01-05 is a Monday.
    const mondayMidnightWinter = zonedDateTime(2026, 1, 5, 0, 0);
    expect(copenhagenWeekday(mondayMidnightWinter)).toBe(1);
  });
});
