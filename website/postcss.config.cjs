// The website is an Astro site on Tailwind 3, via @astrojs/tailwind. Without a
// config here, Vite searches upward and finds the app root's postcss.config.cjs,
// which loads @tailwindcss/postcss — not installed for the website.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
