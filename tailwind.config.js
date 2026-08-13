/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The prototype referenced `fplPurple` with no config, so every
        // `via-fplPurple` / `bg-fplPurple` class silently resolved to nothing.
        fplPurple: '#37003c',
        fplGreen: '#00ff87',
        fplCyan: '#04f5ff',
      },
    },
  },
  plugins: [],
};
