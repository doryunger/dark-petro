import { describe, expect, it } from "vitest";
import { addDays, clamp, dayIndex, defaultFilter, formatDate, formatTime, fromDayIndex, sliderRange, todayUtc } from "./dates.js";

describe("dates", () => {
  it("takes today in UTC, not in the local zone", () => {
    expect(todayUtc(new Date("2026-10-24T23:59:59Z"))).toBe("2026-10-24");
    expect(todayUtc(new Date("2026-10-25T00:00:01Z"))).toBe("2026-10-25");
  });

  it("converts days both ways and across month ends", () => {
    expect(fromDayIndex(dayIndex("2026-10-24"))).toBe("2026-10-24");
    expect(addDays("2026-11-02", -3)).toBe("2026-10-30");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("shows dates as DD.MM.YYYY and times in UTC", () => {
    expect(formatDate("2026-09-01")).toBe("01.09.2026");
    expect(formatTime(1792565558)).toBe("06:52 UTC");
  });

  it("starts with the seven days that end today", () => {
    expect(defaultFilter("2026-10-24", ["s1", "s2"])).toEqual({ from: "2026-10-18", to: "2026-10-24", sources: ["s1", "s2"] });
  });

  it("keeps the slider inside the data range", () => {
    const filter = { from: "2026-10-18", to: "2026-10-24", sources: [] };
    expect(sliderRange(filter, "2026-09-01", "2026-10-24")).toEqual([dayIndex("2026-10-18"), dayIndex("2026-10-24")]);
    expect(sliderRange(filter, "2026-09-01", "2026-10-10")).toEqual([dayIndex("2026-10-10"), dayIndex("2026-10-10")]);
    expect(clamp(5, 1, 3)).toBe(3);
  });
});
