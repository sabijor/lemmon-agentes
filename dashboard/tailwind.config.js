/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      colors: {
        stone: {
          50: '#fafaf9', 100: '#f5f5f4', 200: '#e7e5e4', 300: '#d6d3d1',
          400: '#a8a29e', 500: '#78716c', 600: '#57534e', 700: '#44403c',
          800: '#292524', 900: '#1c1917',
        },
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        blink: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } },
        'talk-bob': { '0%,100%': { transform: 'translateY(0) scaleX(1)' }, '25%': { transform: 'translateY(-3px) scaleX(0.97)' }, '75%': { transform: 'translateY(2px) scaleX(1.02)' } },
        shimmer: { '0%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' }, '100%': { backgroundPosition: '0% 50%' } },
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        blink: 'blink 1s step-end infinite',
        'talk-bob': 'talk-bob 0.4s ease-in-out infinite',
        shimmer: 'shimmer 3s infinite linear',
      },
    },
  },
  plugins: [],
}
