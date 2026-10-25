import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontSize: { xs: ["13px", { lineHeight: "20px" }] },
      colors: {
        ink: "rgb(var(--canvas) / <alpha-value>)",
        panel: "rgb(var(--surface) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        sidebar: "rgb(var(--sidebar) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        hover: "rgb(var(--hover) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        control: { DEFAULT: "rgb(var(--control) / <alpha-value>)", border: "rgb(var(--control-border) / <alpha-value>)" },
        success: "rgb(var(--success) / <alpha-value>)",
        denied: "rgb(var(--denied) / <alpha-value>)",
        failed: "rgb(var(--failed) / <alpha-value>)",
        unknown: "rgb(var(--unknown) / <alpha-value>)",
        incomplete: "rgb(var(--incomplete) / <alpha-value>)",
        conflict: "rgb(var(--conflict) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};

export default config;
