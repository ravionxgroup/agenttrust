"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Activity, Bot, FileText, Gauge, Hammer, ListTree, Menu, X } from "lucide-react";
import { NAVIGATION_ITEMS, navigationState } from "../../lib/navigation";

const icons = { Overview: Gauge, Agents: Bot, Runs: ListTree, Audit: Activity, Tools: Hammer, Policies: FileText };

export function Navigation() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const focused = useRef<"button" | "links" | null>(null);
  const activeItem = NAVIGATION_ITEMS.find(item => navigationState(pathname, item.href).active);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const resize = () => {
      setOpen(false);
      // CSS can hide a focused control before matchMedia's event is delivered.
      const lostFocus = !document.activeElement || document.activeElement === document.body;
      if (media.matches && (document.activeElement === button.current || (lostFocus && focused.current === "button"))) {
        (nav.current?.querySelector<HTMLAnchorElement>('a[data-active="true"]') ?? nav.current?.querySelector<HTMLAnchorElement>("a"))?.focus();
      } else if (!media.matches && (nav.current?.contains(document.activeElement) || (lostFocus && focused.current === "links"))) {
        button.current?.focus();
      }
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) {
        focused.current = null;
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  const MenuIcon = open ? X : Menu;
  return (
    <div ref={container} className="min-w-0"
      onFocusCapture={event => { focused.current = button.current?.contains(event.target) ? "button" : "links"; }}
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
          if (event.relatedTarget !== document.body) focused.current = null;
          setOpen(false);
        }
      }}
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          button.current?.focus();
        }
      }}>
      <button ref={button} type="button" aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open} aria-controls="console-navigation" onClick={() => setOpen(value => !value)}
        className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg border border-line text-sm text-foreground hover:bg-hover lg:hidden">
        <MenuIcon className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Navigation — {activeItem?.label}</span>
      </button>
      <nav ref={nav} id="console-navigation" aria-label="Console navigation" className={`${open ? "block" : "hidden lg:block"} absolute left-0 right-0 top-full border-b border-line bg-panel shadow-lg lg:static lg:border-0 lg:bg-transparent lg:shadow-none`}>
        <span id="current-navigation-section" className="sr-only">Current section</span>
        <div className="ui-nav-links">
          {NAVIGATION_ITEMS.map(item => {
            const Icon = icons[item.label];
            const { active, current } = navigationState(pathname, item.href);
            return <Link key={item.href} href={item.href} onNavigate={() => setOpen(false)}
              aria-current={current ? "page" : undefined}
              aria-describedby={active && !current ? "current-navigation-section" : undefined}
              data-active={active ? "true" : undefined}
              className={`focus-ring ui-nav-link ${active ? "border-accent bg-accent/10 font-semibold text-accent" : "border-transparent font-medium text-muted"}`}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{item.label}</span>
            </Link>;
          })}
        </div>
      </nav>
    </div>
  );
}
