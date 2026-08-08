import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "on-background": "rgb(var(--c-on-background) / <alpha-value>)",
        "background": "rgb(var(--c-background) / <alpha-value>)",
        "surface": "rgb(var(--c-surface) / <alpha-value>)",
        "surface-container": "rgb(var(--c-surface-container) / <alpha-value>)",
        "surface-container-low": "rgb(var(--c-surface-container-low) / <alpha-value>)",
        "surface-container-high": "rgb(var(--c-surface-container-high) / <alpha-value>)",
        "surface-container-highest": "rgb(var(--c-surface-container-highest) / <alpha-value>)",
        "surface-container-lowest": "rgb(var(--c-surface-container-lowest) / <alpha-value>)",
        "surface-bright": "rgb(var(--c-surface-bright) / <alpha-value>)",
        "on-surface": "rgb(var(--c-on-surface) / <alpha-value>)",
        "on-surface-variant": "rgb(var(--c-on-surface-variant) / <alpha-value>)",
        "primary": "rgb(var(--c-primary) / <alpha-value>)",
        "primary-dim": "rgb(var(--c-primary-dim) / <alpha-value>)",
        "primary-container": "rgb(var(--c-primary-container) / <alpha-value>)",
        "on-primary": "rgb(var(--c-on-primary) / <alpha-value>)",
        "on-primary-container": "rgb(var(--c-on-primary-container) / <alpha-value>)",
        "secondary": "rgb(var(--c-secondary) / <alpha-value>)",
        "secondary-container": "rgb(var(--c-secondary-container) / <alpha-value>)",
        "on-secondary-container": "rgb(var(--c-on-secondary-container) / <alpha-value>)",
        "tertiary": "rgb(var(--c-tertiary) / <alpha-value>)",
        "error": "rgb(var(--c-error) / <alpha-value>)",
        "outline": "rgb(var(--c-outline) / <alpha-value>)",
        "outline-variant": "rgb(var(--c-outline-variant) / <alpha-value>)",
        "reader-bg": "var(--reader-bg)",
        "reader-header-bg": "var(--reader-header-bg)",
        "reader-text": "var(--reader-text)",
        "reader-text-muted": "var(--reader-text-muted)",
        "reader-border": "var(--reader-border)",
        "reader-hover": "var(--reader-hover)",
        "reader-primary": "var(--reader-primary)",
        "reader-code-bg": "var(--reader-code-bg)",
      },
      fontFamily: {
        headline: ["Playfair Display", "Georgia", "serif"],
        body: ["EB Garamond", "Georgia", "serif"],
        label: ["Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      // Lumina's type scale. Each entry carries its own line-height and tracking
      // so callers use one class instead of restating the pair every time.
      fontSize: {
        "headline-lg": ["48px", { lineHeight: "56px", fontWeight: "700" }],
        "headline-lg-mobile": ["32px", { lineHeight: "40px", fontWeight: "700" }],
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "display-reading": ["24px", { lineHeight: "36px", fontWeight: "400" }],
        "body-main": ["20px", { lineHeight: "32px", letterSpacing: "-0.01em" }],
        "ui-label": ["14px", { lineHeight: "20px", letterSpacing: "0.02em", fontWeight: "500" }],
        "ui-small": ["12px", { lineHeight: "16px" }],
      },
      // 8px baseline grid. stack-* are the vertical rhythm steps; the design
      // uses stack-lg between major editorial sections to keep the page quiet.
      spacing: {
        unit: "8px",
        gutter: "24px",
        "stack-sm": "12px",
        "stack-md": "32px",
        "stack-lg": "64px",
        "reading-margin-mobile": "24px",
        "reading-margin-desktop": "120px",
      },
      // Soft (0.25rem) shape language — premium stationery, not newsprint.
      borderRadius: {
        DEFAULT: "0.25rem",
        sm: "0.125rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
      },
      maxWidth: {
        // 65–75 characters at body-main, per the reading-column rule.
        reading: "680px",
      },
    },
  },
  plugins: [typography],
};

export default config;
