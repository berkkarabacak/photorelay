/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#09090b",
        foreground: "#f4f4f5",
        card: "#131316",
        border: "#26262b",
        primary: "#34d399",
        mutedfg: "#9d9da8",
        amber: "#fbbf24",
      },
    },
  },
  plugins: [],
};
