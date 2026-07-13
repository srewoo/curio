/** @type {import('tailwindcss').Config} */
// Palette lifted from design/mockups.html: warm paper + sage.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#FAF7F2', 2: '#F4F0E7', 3: '#F1EDE5' },
        card: '#FFFDF8',
        ink: { DEFAULT: '#2C2C2A', 2: '#6B6558', 3: '#7A7368' },
        line: { DEFAULT: '#E5DEC9', 2: '#D3C9B0' },
        sage: { DEFAULT: '#5DCAA5', ink: '#04342C', tint: '#E1F5EE', line: '#9FE1CB' },
        amber: { tint: '#FAEEDA', ink: '#854F0B' },
        userbubble: '#E7EFE6',
        userink: '#17342A',
        shell: '#EFEAE0',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
