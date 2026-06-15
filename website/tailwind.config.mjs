/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,ts}'],
  theme: {
    extend: {
      colors: {
        bg:              '#0d0c08',
        surface:         '#1a160f',
        card:            '#221d14',
        accent:          '#f6a623',
        'accent-bright': '#fbd089',
        'accent-dim':    '#4a3a18',
        cream:           '#f0ede4',
        muted:           '#6b6353',
        border:          'rgba(246, 166, 35, 0.12)',
      },
      fontFamily: {
        headline: ['Epilogue', 'sans-serif'],
        sans:     ['Manrope', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
