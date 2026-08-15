/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1F1B16',
        paper: '#FBF7F0',
        card: '#FFFFFF',
        line: '#EDE6DA',
        mute: '#8A8170',
        brand: { DEFAULT: '#C8956D', dark: '#A8764E', soft: '#F4E8D8' },
        good: '#3F9D6B',
        warn: '#E0A040',
        bad: '#D26565',
      },
      fontFamily: {
        sans: [
          'Nunito',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei UI"',
          'sans-serif',
        ],
      },
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.55' }],
        sm: ['0.9375rem', { lineHeight: '1.6' }],
        base: ['1.0625rem', { lineHeight: '1.65' }],
        lg: ['1.1875rem', { lineHeight: '1.45' }],
        xl: ['1.375rem', { lineHeight: '1.35' }],
        '2xl': ['1.625rem', { lineHeight: '1.25' }],
      },
      fontWeight: { medium: '500', semibold: '600', bold: '600' },
    },
  },
  plugins: [],
};
