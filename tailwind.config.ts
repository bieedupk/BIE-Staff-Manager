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
      }
    }
  },
  plugins: []
};

export default config;
