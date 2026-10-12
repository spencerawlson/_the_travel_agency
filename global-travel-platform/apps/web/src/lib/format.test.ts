import { describe, expect, it } from "vitest";
import { dayOffset, formatDuration, formatLocalTime, formatMoney } from "./format";

describe("format", () => {
  it("formats money per locale", () => {
    expect(formatMoney("1234", "CAD", "en")).toMatch(/\$1,234/);
    expect(formatMoney("1234", "EUR", "fr").replace(/\s/g, " ")).toMatch(/1 234 €/);
  });

  it("formats durations", () => {
    expect(formatDuration(425)).toBe("7h 05m");
  });

  it("shows airport-local times from ISO offsets", () => {
    expect(formatLocalTime("2030-05-01T14:45:00-04:00", "fr")).toMatch(/14 h 45|14:45/);
  });

  it("computes next-day arrival offsets", () => {
    expect(dayOffset("2030-05-01T22:00:00-04:00", "2030-05-02T11:00:00+02:00")).toBe(1);
    expect(dayOffset("2030-05-01T08:00:00-04:00", "2030-05-01T11:00:00-04:00")).toBe(0);
  });
});
