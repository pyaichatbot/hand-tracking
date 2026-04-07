/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        neon: {
          green: '#00FF88',
          cyan: '#00FFFF',
          magenta: '#FF00FF',
          yellow: '#FFFF00',
        },
        bg: '#0A0A0A',
      },
    },
  },
  plugins: [],
};
