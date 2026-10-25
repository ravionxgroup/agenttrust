"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { resolveTheme, THEME_STORAGE_KEY, type Theme } from "../../lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    setTheme(resolveTheme(document.documentElement.getAttribute("data-theme")));
  }, []);

  const next = theme === "light" ? "obsidian" : "light";
  const label = `Switch to ${next === "light" ? "Light" : "Obsidian"} theme`;
  const Icon = theme === "light" ? Moon : Sun;

  function toggle() {
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* Current-page switching still works without storage. */ }
  }

  return (
    <button type="button" aria-label={label} title={label} disabled={theme === null}
      onClick={toggle}
      className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-md border border-control-border bg-control text-foreground hover:bg-hover motion-safe:transition-colors motion-reduce:transition-none disabled:opacity-60">
      <Icon aria-hidden="true" focusable="false" className={`h-4 w-4 ${theme === null ? "invisible" : ""}`} />
    </button>
  );
}
