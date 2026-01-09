/** @type {import('tailwindcss').Config} */

const accentHue = 25;
const accentSaturation = 90;

export default {
  content: [
    './index.html',
    './src/**/*.{html,js,svelte,ts}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          50:  `hsl(${accentHue}, ${accentSaturation}%, 97%)`,
          100: `hsl(${accentHue}, ${accentSaturation}%, 94%)`,
          200: `hsl(${accentHue}, ${accentSaturation}%, 88%)`,
          300: `hsl(${accentHue}, ${accentSaturation}%, 80%)`,
          400: `hsl(${accentHue}, ${accentSaturation}%, 70%)`,
          500: `hsl(${accentHue}, ${accentSaturation}%, 60%)`,
          600: `hsl(${accentHue}, ${accentSaturation}%, 50%)`,
          700: `hsl(${accentHue}, ${accentSaturation}%, 40%)`,
          800: `hsl(${accentHue}, ${accentSaturation}%, 30%)`,
          900: `hsl(${accentHue}, ${accentSaturation}%, 20%)`,
          950: `hsl(${accentHue}, ${accentSaturation}%, 12%)`,
        },
        // Dark mode background colors
        dark: {
          50:  '#f9fafb',
          100: '#1e1e2e',
          200: '#1a1a28',
          300: '#16161f',
          400: '#13131a',
          500: '#0f0f14',
          600: '#0c0c10',
          700: '#09090c',
          800: '#060608',
          900: '#030304',
          950: '#010101',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
