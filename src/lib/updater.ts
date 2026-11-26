import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  getAutoUpdateCheck,
  getLastUpdateCheck,
  setLastUpdateCheck,
} from "./settings";

// The app asks GitHub for `latest.json` from the newest published release
// (the endpoint is in tauri.conf.json). Drafts and `-rc` tags are never
// served, so test builds can't reach users. Every update is verified against
// the public key in tauri.conf.json before it is installed.

export type { Update };

/** At most one automatic check a day. */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Dev builds (`npm run dev:app`) never update themselves: an "update" would
 * replace the debug binary with a release build.
 */
export const updatesDisabled = import.meta.env.DEV;

/** Whether an automatic check should run now. Pure, so it can be tested. */
export function isCheckDue(
  enabled: boolean,
  lastCheckedMs: number,
  nowMs: number,
): boolean {
  if (!enabled) return false;
  // A clock that moved backwards would otherwise block checks for a long time.
  if (lastCheckedMs > nowMs) return true;
  return nowMs - lastCheckedMs >= UPDATE_CHECK_INTERVAL_MS;
}

/**
 * The launch-time check. Silent: returns null when checks are off, not due,
 * already up to date, or GitHub can't be reached. Only a successful check
 * counts towards the daily limit, so an offline launch retries next time.
 */
export async function autoCheckForUpdate(): Promise<Update | null> {
  if (updatesDisabled) return null;
  try {
    const [enabled, last] = await Promise.all([
      getAutoUpdateCheck(),
      getLastUpdateCheck(),
    ]);
    const now = Date.now();
    if (!isCheckDue(enabled, last, now)) return null;
    const update = await check();
    await setLastUpdateCheck(now);
    return update;
  } catch (e) {
    console.warn("feedlight: update check failed", e);
    return null;
  }
}

/** "Check now" in Settings. Throws, so the caller can show the error. */
export async function checkForUpdateNow(): Promise<Update | null> {
  if (updatesDisabled) {
    throw new Error("Updates are disabled in development builds.");
  }
  const update = await check();
  await setLastUpdateCheck(Date.now());
  return update;
}

/**
 * Downloads, verifies and installs the update, then restarts the app.
 * `onProgress` gets 0–1, or null while the size is unknown.
 */
export async function installUpdate(
  update: Update,
  onProgress?: (fraction: number | null) => void,
): Promise<void> {
  let total = 0;
  let received = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
      onProgress?.(total ? 0 : null);
    } else if (event.event === "Progress") {
      received += event.data.chunkLength;
      onProgress?.(total ? Math.min(received / total, 1) : null);
    } else {
      onProgress?.(1);
    }
  });
  await relaunch();
}

/** Where to send people when an in-app install fails. */
export const RELEASES_URL =
  "https://github.com/Nishanshetty/feedlight/releases/latest";
