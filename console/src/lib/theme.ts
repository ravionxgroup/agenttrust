export const THEMES = ["obsidian", "light"] as const;
export type Theme = typeof THEMES[number];
export const DEFAULT_THEME: Theme = "obsidian";
export const THEME_STORAGE_KEY = "agenttrust.console.theme.v1";

export function resolveTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? value as Theme : DEFAULT_THEME;
}

// Fixed, application-owned code only. Never interpolate storage, query strings,
// audit content or other request data into this script. CSP guidance: README.
export const THEME_INIT_SCRIPT = `(function(){var theme="obsidian";try{var stored=localStorage.getItem("agenttrust.console.theme.v1");if(stored==="light"||stored==="obsidian")theme=stored;}catch(e){}document.documentElement.setAttribute("data-theme",theme);})();`;
