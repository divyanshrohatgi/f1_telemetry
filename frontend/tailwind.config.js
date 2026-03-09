/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Titillium Web"', '"Barlow Condensed"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        f1: {
          red: '#E10600',
          black: '#111111',
          surface: '#1A1A1A',
          panel: '#1E1E1E',
          elevated: '#252525',
          border: '#333333',
          muted: '#2A2A2A',
        },
        text: {
          primary: '#F0F0F0',
          secondary: '#888888',
          tertiary: '#555555',
        },
        compound: {
          soft: '#FF3333',
          medium: '#FFC906',
          hard: '#CCCCCC',
          inter: '#39B54A',
          wet: '#0072C6',
          unknown: '#666666',
        },
        delta: {
          positive: '#00FF87',
          negative: '#FF4444',
        },
      },
      fontSize: {
        '2xs': ['10px', '14px'],
      },
      letterSpacing: {
        widest: '0.15em',
        wider: '0.1em',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '4px',
      },
    },
  },
  plugins: [],
}
