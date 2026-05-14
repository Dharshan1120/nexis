/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abyss: "#050816",
        cyan: {
          300: "#72f6ff",
          400: "#3be7ff",
          500: "#00d4ff"
        },
        steel: "#93a4bf"
      },
      boxShadow: {
        glow: "0 0 40px rgba(59, 231, 255, 0.25)"
      },
      fontFamily: {
        display: ["Segoe UI", "system-ui", "sans-serif"]
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(114, 246, 255, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(114, 246, 255, 0.08) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};
