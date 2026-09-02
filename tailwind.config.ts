import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        report: {
          present: "#10b981",
          absent: "#ef4444",
          late: "#f59e0b",
          halfday: "#f97316",
          pending: "#cbd5e1",
          scheduled: "#cbd5e1",
          text: "#64748b"
        },
        bie: {
          50: "#edf8f3",
          100: "#d5efe4",
          600: "#13795b",
          700: "#0f604b",
          900: "#12382f"
        }
      },
      boxShadow: {
        soft: "0 14px 36px rgba(18, 56, 47, 0.08)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "draw-line": {
          "to": { strokeDashoffset: "0" }
        },
        "scale-up-y": {
          "0%": { transform: "scaleY(0)" },
          "100%": { transform: "scaleY(1)" }
        },
        "scale-up-x": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" }
        },
        "rise-and-settle": {
          "0%": { opacity: "0", transform: "translateY(28px)" },
          "60%": { opacity: "1", transform: "translateY(-6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "slide-in-settle": {
          "0%": { opacity: "0", transform: "translateX(-24px)" },
          "60%": { opacity: "1", transform: "translateX(4px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        "chart-settle": {
          "0%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
          "100%": { transform: "translateY(0)" }
        },
        "bar-grow-settle": {
          "0%": { opacity: "0.65", transform: "translateY(14px) scaleY(0)" },
          "75%": { opacity: "1", transform: "translateY(-4px) scaleY(1.02)" },
          "100%": { transform: "translateY(0) scaleY(1)" }
        }
      },
      animation: {
        "fade-up": "fade-up 450ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-in": "fade-in 400ms ease-out forwards",
        "draw-line": "draw-line 800ms ease-out forwards",
        "scale-up-y": "scale-up-y 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-up-x": "scale-up-x 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "rise-and-settle": "rise-and-settle 1500ms ease-out forwards",
        "slide-in-settle": "slide-in-settle 1000ms ease-out forwards",
        "chart-settle": "chart-settle 400ms ease-out forwards",
        "bar-grow-settle": "bar-grow-settle 1500ms ease-in-out forwards"
      }
    }
  },
  plugins: []
};

export default config;
