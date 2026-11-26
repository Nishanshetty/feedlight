import { describe, expect, it } from "vitest";

import {
  DATE_RANGE_OPTIONS,
  DEFAULT_RANGE,
  isValidRange,
  rangeToSince,
} from "./date-range";

const DAY_MS = 86_400_000;

describe("isValidRange", () => {
  it("accepts every advertised option", () => {
    for (const { value } of DATE_RANGE_OPTIONS) {
      expect(isValidRange(value)).toBe(true);
    }
  });

  it("rejects anything else, including empty and nullish", () => {
    for (const v of ["", "1w", "31d", "ALL", "all ", undefined, null]) {
      expect(isValidRange(v)).toBe(false);
    }
  });
});

describe("rangeToSince", () => {
  it("returns null for the all-time range", () => {
    expect(rangeToSince("all")).toBeNull();
  });

  it("floors to local midnight and steps by whole days", () => {
    const since = rangeToSince("7d");
    expect(since).not.toBeNull();

    const d = new Date(since!);
    expect([
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      d.getMilliseconds(),
    ]).toEqual([0, 0, 0, 0]);

    // The exact offset depends on when the test runs relative to local
    // midnight, so assert the window instead of a fixed 7 days: flooring to
    // midnight puts the boundary between 6 and 8 days back.
    const daysBack = (Date.now() - d.getTime()) / DAY_MS;
    expect(daysBack).toBeGreaterThan(6);
    expect(daysBack).toBeLessThanOrEqual(8);
  });

  it("treats 1d as calendar-today, not as a rolling 24 hours", () => {
    const since = new Date(rangeToSince("1d")!);
    const now = new Date();
    expect(since.getFullYear()).toBe(now.getFullYear());
    expect(since.getMonth()).toBe(now.getMonth());
    expect(since.getDate()).toBe(now.getDate());
  });

  it("orders the ranges from narrowest to widest", () => {
    const since1 = new Date(rangeToSince("1d")!).getTime();
    const since30 = new Date(rangeToSince("30d")!).getTime();
    expect(since30).toBeLessThan(since1);
  });
});

describe("DEFAULT_RANGE", () => {
  it("is one of the advertised options", () => {
    expect(DATE_RANGE_OPTIONS.map((o) => o.value)).toContain(DEFAULT_RANGE);
  });
});
