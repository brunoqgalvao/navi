/** @type {import('tailwindcss').Config} */

const accentHue = 25;
const accentSaturation = 90;

export default {
  content: [
    './index.html',
    './src/**/*.{html,js,svelte,ts}'
  ],
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
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
