import { Navigation } from "./navigation";
import { ThemeToggle } from "./theme-toggle";

export function AppHeader() {
  return <header className="border-b border-line bg-panel">
    <div className="border-b border-line bg-sidebar">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-3 px-6 lg:px-8">
        <div className="min-w-0">
          <div className="text-base font-semibold text-foreground">AgentTrust</div>
          <div className="text-[11px] text-muted sm:text-xs">AI Agent Security &amp; Observability</div>
        </div>
        <div className="shrink-0"><ThemeToggle /></div>
      </div>
    </div>
    <Navigation />
  </header>;
}
