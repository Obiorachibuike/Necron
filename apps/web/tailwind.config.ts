import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.25rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        border: "var(--border)",
        fg: "var(--fg)",
        muted: "var(--muted)",
        neon: "#39FF14",
        "neon-ink": "#061007",
        brand: "var(--brand)",
        "brand-soft": "var(--brand-soft)",
        danger: "var(--danger)",
        warning: "var(--warning)",
        success: "var(--success)",
        info: "var(--info)",
      },
      borderRadius: { xl: "0.9rem", "2xl": "1.25rem" },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto",
               "Helvetica Neue", "Arial", "Noto Sans", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(57,255,20,0.28), 0 8px 32px -12px rgba(57,255,20,0.35)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" },
                     to: { opacity: "1", transform: "translateY(0)" } },
        pulsebar: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.45" } },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out",
        pulsebar: "pulsebar 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
