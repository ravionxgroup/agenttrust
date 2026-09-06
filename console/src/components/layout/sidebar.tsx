"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bot, FileText, Gauge, Hammer, ListTree } from "lucide-react";

const items = [
  { label: "Overview", href: "/", icon: Gauge },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Runs", href: "/runs", icon: ListTree },
  { label: "Audit", href: "/audit", icon: Activity },
  { label: "Tools", href: "/tools", icon: Hammer },
  { label: "Policies", href: "/policies", icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-line bg-[#0b1424] px-4 py-5 lg:block">
      <div className="px-2">
        <div className="text-sm font-semibold text-white">AgentTrust</div>
        <div className="mt-1 text-xs text-slate-500">Security Console</div>
      </div>
      <nav className="mt-8 space-y-1" aria-label="Console navigation">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.href !== "#" && pathname === item.href;
          const className = [
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition",
            active ? "bg-teal-400/10 text-teal-100" : "text-slate-400",
            "hover:bg-white/5 hover:text-white",
          ].join(" ");

          return (
            <Link key={item.label} href={item.href} className={className}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
