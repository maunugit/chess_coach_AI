/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'chess-primary': '#2D3748',
        'chess-secondary': '#4A5568',
        'analysis-bg': '#F7FAFC',
      }
    }
  },
  plugins: [],
}
