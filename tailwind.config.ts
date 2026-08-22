import type { Config } from "tailwindcss";

/**
 * Sampled from their own material rather than invented: the gold, sand and
 * chocolate brown of the existing site, plus the two paper stocks and the
 * pale olive bee drawings from the printed menu.
 *
 * Terracotta is deliberately NOT the house colour. It is held back for the
 * places it earns — the printed category bars, the cover logo, the accent
 * word — and lives in its own `clay` scale so it can't leak everywhere.
 *
 * The `honey` / `hive` scale names are kept so existing markup keeps working;
 * `honey` now carries the gold and `hive` the chocolate inks.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Gold / tan — the dominant accent on their existing site (the nav
        // band, the script headings). This is what carries the site now.
        honey: {
          50: "#FBF5E4",
          100: "#F3E9CE",
          200: "#E7D5A6",
          300: "#D8BE7E",
          400: "#C9A55B",
          500: "#A8873F",
          600: "#6E5525", // links and eyebrows — clears AA on cream and on sand
          700: "#634C21",
          800: "#463517",
          900: "#2E230E",
        },
        // Warm chocolate browns: their dark band, their heading ink.
        hive: {
          50: "#F2EAD6",
          100: "#E3D6B6",
          200: "#C3AB7D",
          300: "#9A7F55",
          400: "#6F5330", // secondary text — clears AA on the sand ground too
          500: "#63482A",
          600: "#533A1F",
          700: "#422810", // heading ink
          800: "#331E0C", // the dark band and the footer
          900: "#231407",
        },
        // Terracotta, held back for the places it earns: the printed category
        // bars, the cover logo, the "Favoriet" mark.
        clay: {
          100: "#EFDDD6",
          200: "#DFBFB3",
          300: "#C99A88",
          400: "#B4735E", // the printed bar colour, for large marks and the logo
          500: "#935644", // a shade deeper, so pale text on it clears AA on screen
          600: "#7F4B3B",
          700: "#63382C",
        },
        // The pale olive of the drawn bees.
        sage: {
          100: "#E7E8D8",
          200: "#CFD2B4",
          300: "#B3B78F",
          400: "#98A075",
          500: "#7C855C",
          600: "#616949",
          700: "#454B34",
        },
        paper: {
          DEFAULT: "#F1ECE1", // inner sheet
          deep: "#E8E2D4",
          shade: "#DCD5AC", // the sand ground from their site
          cover: "#C6C49B", // the khaki handmade cover stock
          coverDeep: "#B2B086",
        },
        ink: "#422810",
        cream: "#F1ECE1",
        charcoal: "#331E0C",
      },
      fontFamily: {
        // The printed pieces use one geometric sans throughout, with a brush
        // script reserved for card titles. No serif appears anywhere on them.
        display: ["'Jost'", "system-ui", "sans-serif"],
        body: ["'Jost'", "system-ui", "sans-serif"],
        hand: ["'Kaushan Script'", "'Segoe Script'", "cursive"],
      },
      letterSpacing: {
        label: "0.22em",
        bar: "0.08em",
      },
      transitionTimingFunction: {
        settle: "cubic-bezier(0.16, 0.84, 0.28, 1)",
        ink: "cubic-bezier(0.32, 0.08, 0.24, 1)",
      },
      boxShadow: {
        // A sheet resting on a surface — contact, not levitation.
        sheet: "0 1px 0 0 rgba(42,38,34,0.05), 0 10px 26px -20px rgba(42,38,34,0.55)",
        lift: "0 2px 0 0 rgba(42,38,34,0.07), 0 26px 46px -30px rgba(42,38,34,0.6)",
        card: "0 14px 34px -24px rgba(42,38,34,0.7)",
      },
      animation: {
        float: "float 14s ease-in-out infinite",
        "float-delayed": "float 14s ease-in-out 4s infinite",
        "fade-up": "fadeUp 1.1s cubic-bezier(0.16, 0.84, 0.28, 1) forwards",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
