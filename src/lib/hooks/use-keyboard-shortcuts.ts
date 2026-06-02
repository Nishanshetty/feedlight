import { useEffect, useRef } from "react";

export type KeyHandlers = Partial<Record<string, () => void>>;

export function useKeyboardShortcuts(handlers: KeyHandlers): void {
  const ref = useRef<KeyHandlers>(handlers);

  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) return;

      const isShiftedAlpha =
        e.shiftKey && e.key.length === 1 && /[A-Za-z]/.test(e.key);
      const key = isShiftedAlpha ? `Shift+${e.key.toUpperCase()}` : e.key;

      const handler = ref.current[key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
