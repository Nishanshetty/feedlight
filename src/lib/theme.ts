import { getAppTheme, type AppTheme } from "./settings";

// Mirrored to localStorage so the boot path can apply the theme synchronously,
// before the async Tauri store is readable — avoids a flash of the wrong theme.
const LS_KEY = "focal:theme";

let current: AppTheme = "system";

function resolve(theme: AppTheme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setClass(theme: AppTheme) {
  document.documentElement.classList.toggle("dark", resolve(theme) === "dark");
}

export function applyTheme(theme: AppTheme): void {
  current = theme;
  try { localStorage.setItem(LS_KEY, theme); } catch { /* ignore */ }
  setClass(theme);
}

export function initTheme(): void {
  let initial: AppTheme = "system";
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "light" || v === "dark" || v === "system") initial = v;
  } catch { /* ignore */ }
  current = initial;
  setClass(initial);

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (current === "system") setClass(current);
  });

  // The Tauri store is the source of truth; reconcile once it's readable.
  getAppTheme().then(applyTheme).catch(() => { /* keep mirrored value */ });
}
