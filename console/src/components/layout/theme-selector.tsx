"use client";

import { useEffect, useState } from "react";
import { resolveTheme, THEMES, THEME_STORAGE_KEY, type Theme } from "../../lib/theme";

export function ThemeSelector() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    setTheme(resolveTheme(document.documentElement.getAttribute("data-theme")));
  }, []);

  function change(value: string) {
    const next = resolveTheme(value);
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* Current-page switching still works without storage. */ }
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Theme
      <select aria-label="Theme" value={theme ?? "midnight"} disabled={theme === null}
        onChange={event => change(event.target.value)}
        className="focus-ring rounded-md border border-control-border bg-control px-3 py-2 text-sm text-foreground disabled:opacity-60">
        {THEMES.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
      </select>
    </label>
  );
}
