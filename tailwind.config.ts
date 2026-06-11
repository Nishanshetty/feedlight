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
        headline: ["Epilogue", "sans-serif"],
        body: ["Manrope", "sans-serif"],
        label: ["Manrope", "sans-serif"],
        sans: ["Manrope", "sans-serif"],
      },
    },
  },
  plugins: [typography],
};

export default config;
