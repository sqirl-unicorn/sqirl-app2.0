/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Golden ratio φ = 1.618 — typographic and spacing scale
      fontSize: {
        'φ-xs':  ['0.625rem', { lineHeight: '1.618' }], // 10px
        'φ-sm':  ['0.875rem', { lineHeight: '1.618' }], // 14px
        'φ-base':['1rem',     { lineHeight: '1.618' }], // 16px
        'φ-lg':  ['1.618rem', { lineHeight: '1.618' }], // 26px
        'φ-xl':  ['2.618rem', { lineHeight: '1.2'   }], // 42px
      },
      spacing: {
        'φ-1': '0.25rem',  // 4px
        'φ-2': '0.375rem', // 6px
        'φ-3': '0.625rem', // 10px
        'φ-4': '1rem',     // 16px
        'φ-5': '1.618rem', // 26px
        'φ-6': '2.618rem', // 42px
        'φ-7': '4.236rem', // 68px
      },
      borderRadius: {
        'φ-xs': '3px',
        'φ-sm': '5px',
        'φ-md': '8px',
        'φ-lg': '13px',
        'φ-xl': '21px',
      },
      colors: {
        // Brand (same as v1)
        primary: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe',
          300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6',
          600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a',
        },
        // Recovery — milder sage/teal palette (not alarming, not urgent)
        recovery: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
