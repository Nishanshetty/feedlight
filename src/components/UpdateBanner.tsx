import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  autoCheckForUpdate,
  installUpdate,
  RELEASES_URL,
  type Update,
} from "../lib/updater";

type Phase = "available" | "installing" | "error";

/**
 * A slim bar above the toolbar, shown only when a newer version is available.
 * It never blocks reading: "Later" hides it until the next launch, and the
 * check itself runs at most once a day (see src/lib/updater.ts).
 */
export default function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>("available");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    autoCheckForUpdate().then((u) => {
      if (!cancelled) setUpdate(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;

  async function install() {
    if (!update) return;
    setPhase("installing");
    setProgress(null);
    try {
      await installUpdate(update, setProgress);
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

  const button =
    "shrink-0 px-3 py-1 text-ui-small font-label font-bold uppercase tracking-[0.14em] transition-opacity hover:opacity-80 disabled:opacity-40";

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 bg-primary-container px-6 py-2 text-on-primary-container"
    >
      <p className="min-w-0 flex-1 truncate text-sm font-body" title={error}>
        {phase === "available" && (
          <>
            <span className="font-semibold">Feedlight {update.version}</span> is
            available.
          </>
        )}
        {phase === "installing" &&
          (progress === null
            ? `Downloading Feedlight ${update.version}…`
            : progress < 1
              ? `Downloading Feedlight ${update.version}… ${Math.round(progress * 100)}%`
              : "Installing… Feedlight will restart.")}
        {phase === "error" && "The update couldn't be installed."}
      </p>

      {phase === "available" && (
        <>
          <button
            onClick={install}
            className={`${button} bg-primary text-on-primary`}
          >
            Update &amp; restart
          </button>
          <button onClick={() => setUpdate(null)} className={button}>
            Later
          </button>
        </>
      )}
      {phase === "error" && (
        <>
          <button
            onClick={() => openUrl(RELEASES_URL)}
            className={`${button} bg-primary text-on-primary`}
          >
            Download manually
          </button>
          <button onClick={() => setUpdate(null)} className={button}>
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}
