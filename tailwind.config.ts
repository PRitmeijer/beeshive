import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        honey: {
          50: "#FFF8F0",
          100: "#FFF0DB",
          200: "#FFE0B2",
          300: "#FFCC80",
          400: "#F5A623",
          500: "#D4A017",
          600: "#E8920B",
          700: "#B8760A",
          800: "#8B5A08",
          900: "#5C3D06",
        },
        hive: {
          50: "#F5F0EB",
          100: "#E8DDD2",
          200: "#C4A882",
          300: "#8B6914",
          400: "#6B4F10",
          500: "#4A3508",
          600: "#3A2A06",
          700: "#2C1810",
          800: "#1E1008",
          900: "#120A04",
        },
        cream: "#dfd4aa",
        charcoal: "#1A1A2E",
      },
      fontFamily: {
        display: ["'Playfair Display'", "Georgia", "serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
      },
      animation: {
        "float": "float 6s ease-in-out infinite",
        "float-delayed": "float 6s ease-in-out 2s infinite",
        "honey-drip": "honeyDrip 3s ease-in-out infinite",
        "hexagon-pulse": "hexPulse 4s ease-in-out infinite",
        "fade-up": "fadeUp 0.8s ease-out forwards",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        honeyDrip: {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "50%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(100%)", opacity: "0" },
        },
        hexPulse: {
          "0%, 100%": { opacity: "0.3", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(1.05)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
