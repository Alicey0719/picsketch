/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"LINE Seed JP"', 'sans-serif'],
      },
      // LINE Seed JPのウェイトをTailwindのクラスで使いやすくする
      fontWeight: {
        thin: '100',
        extralight: '200',
        light: '300',
        regular: '400',
        medium: '500',
        bold: '700',
        black: '900',
      },
      // picsketchは薄紫をアクセントにする（picconvの緑の立ち位置を置換）
      colors: {
        brand: {
          50:  '#f6f3ff',
          100: '#ede8ff',
          200: '#ddd3ff',
          300: '#c4b2fe',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
        },
      },
    },
  },
  plugins: [],
}
