import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

type Props = {
  onSubmit: (url: string) => void;
  onSubmitPdf: (path: string) => void;
  onClose: () => void;
};

export default function ReadUrlModal({ onSubmit, onSubmitPdf, onClose }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handlePickPdf() {
    const path = await open({
      title: "Choose a PDF",
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (typeof path === "string") {
      onSubmitPdf(path);
      onClose();
    }
  }

  function handleSubmit() {
    const raw = value.trim();
    if (!raw) return;
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(withProtocol);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError("Only http and https URLs are supported");
        return;
      }
      setError("");
      onSubmit(parsed.href);
      onClose();
    } catch {
      setError("Invalid URL — please enter a valid web address");
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-32 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-xl bg-surface border border-outline-variant/40 shadow-2xl p-5">
          <p className="mb-3 text-[10px] font-label font-bold uppercase tracking-widest text-outline">
            Read Article
          </p>
          {error && (
            <p className="mb-2 text-[11px] font-body text-red-500">{error}</p>
          )}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="url"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="Paste article URL…"
              className="flex-1 ghost-border bg-surface-container-low px-3 py-2 text-sm font-body text-on-surface placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button onClick={handleSubmit}
              className="ghost-border bg-primary px-4 py-2 text-[11px] font-label font-bold uppercase tracking-widest text-on-primary transition-opacity hover:opacity-90">
              Read
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-outline-variant/30" />
            <span className="text-[10px] font-label uppercase tracking-widest text-outline">or</span>
            <div className="h-px flex-1 bg-outline-variant/30" />
          </div>
          <button onClick={handlePickPdf}
            className="mt-3 flex w-full items-center justify-center gap-2 ghost-border bg-surface-container-low px-4 py-2 text-[11px] font-label font-bold uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-surface">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Choose a PDF…
          </button>
        </div>
      </div>
    </>
  );
}
