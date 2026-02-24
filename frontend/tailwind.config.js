/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Custom dark theme palette
        dark: {
          bg: "#0a0a0f",
          card: "#12121a",
          surface: "#1a1a2e",
          border: "#2a2a3e",
          text: "#e0e0e8",
          muted: "#8888a0",
          accent: "#00d4aa",       // Emerald green for high scores
          "accent-dim": "#1a6b50", // Dimmed green for lower scores
          warning: "#f59e0b",
          danger: "#ef4444",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
  ],
};
