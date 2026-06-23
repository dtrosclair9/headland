import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1A3D2E',
          light: '#2A5A45',
          dark: '#0F2A1F',
        },
        accent: {
          DEFAULT: '#E8A33D',
          light: '#F2BC68',
          dark: '#C7841A',
          // AA-compliant gold for TEXT on white/light backgrounds (~5:1).
          // DEFAULT/dark are too light as small text on white (~2–3:1).
          text: '#7D5612',
        },
        soil: {
          DEFAULT: '#5C4A36',
          light: '#7A6147',
          dark: '#3F3325',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
