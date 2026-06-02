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
        "on-background": "#1c1c11",
        "background": "#fdfcf7",
        "surface": "#fdfae7",
        "surface-container": "#f1eedc",
        "surface-container-low": "#f7f4e2",
        "surface-container-high": "#ece9d6",
        "surface-container-highest": "#e6e3d1",
        "surface-container-lowest": "#ffffff",
        "surface-bright": "#fdfae7",
        "on-surface": "#1c1c11",
        "on-surface-variant": "#444842",
        "primary": "#182419",
        "primary-dim": "#2d3a2d",
        "primary-container": "#2d3a2d",
        "on-primary": "#ffffff",
        "on-primary-container": "#95a493",
        "secondary": "#5e5f5b",
        "secondary-container": "#e3e3de",
        "on-secondary-container": "#646561",
        "tertiary": "#1b2500",
        "error": "#ba1a1a",
        "outline": "#747872",
        "outline-variant": "#e5e2d0",
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
