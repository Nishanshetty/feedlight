import { describe, expect, it, vi } from "vitest";

// updater.ts imports the Tauri plugins at module load; nothing here calls
// them, so empty stand-ins are enough.
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("./settings", () => ({
  getAutoUpdateCheck: vi.fn(),
  getLastUpdateCheck: vi.fn(),
  setLastUpdateCheck: vi.fn(),
}));

const { isCheckDue, UPDATE_CHECK_INTERVAL_MS: DAY } = await import("./updater");

const NOW = 1_800_000_000_000;

describe("isCheckDue", () => {
  it("never checks when automatic checks are off", () => {
    expect(isCheckDue(false, 0, NOW)).toBe(false);
    expect(isCheckDue(false, NOW - 10 * DAY, NOW)).toBe(false);
  });

  it("checks on the first launch", () => {
    expect(isCheckDue(true, 0, NOW)).toBe(true);
  });

  it("waits a full day between checks", () => {
    expect(isCheckDue(true, NOW - DAY + 1, NOW)).toBe(false);
    expect(isCheckDue(true, NOW - DAY, NOW)).toBe(true);
    expect(isCheckDue(true, NOW - 3 * DAY, NOW)).toBe(true);
  });

  it("checks if the clock moved backwards", () => {
    expect(isCheckDue(true, NOW + DAY, NOW)).toBe(true);
  });
});
