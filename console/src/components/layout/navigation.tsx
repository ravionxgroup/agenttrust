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
    const media = window.matchMedia("(min-width: 640px)");
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
    <div ref={container} className="mx-auto max-w-[1600px] px-6 lg:px-8"
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
        className="focus-ring flex h-12 w-full items-center gap-2 text-sm text-foreground sm:hidden">
        <MenuIcon className="h-4 w-4" aria-hidden="true" />
        <span>Navigation</span><span aria-hidden="true" className="ml-auto text-muted">{activeItem?.label}</span>
      </button>
      <nav ref={nav} id="console-navigation" aria-label="Console navigation" className={open ? "block" : "hidden sm:block"}>
        <span id="current-navigation-section" className="sr-only">Current section</span>
        <div className="grid grid-cols-2 gap-1 pb-3 sm:flex sm:pb-0">
          {NAVIGATION_ITEMS.map(item => {
            const Icon = icons[item.label];
            const { active, current } = navigationState(pathname, item.href);
            return <Link key={item.href} href={item.href} onNavigate={() => setOpen(false)}
              aria-current={current ? "page" : undefined}
              aria-describedby={active && !current ? "current-navigation-section" : undefined}
              data-active={active ? "true" : undefined}
              className={`focus-ring flex h-12 items-center gap-2 border-b-2 px-3 text-sm motion-safe:transition-colors hover:bg-hover ${active ? "border-accent bg-accent/10 font-semibold text-accent" : "border-transparent font-medium text-muted"}`}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{item.label}</span>
            </Link>;
          })}
        </div>
      </nav>
    </div>
  );
}
