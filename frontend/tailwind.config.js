/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Theme-aware colors via CSS variables
        // All existing dark-* classes will auto-adapt to light/dark mode
        dark: {
          bg: "var(--bg)",
          card: "var(--card)",
          surface: "var(--surface)",
          border: "var(--border)",
          text: "var(--text)",
          muted: "var(--muted)",
          accent: "var(--accent)",
          "accent-dim": "#1a6b50",
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
