import { ShieldCheck } from "lucide-react";
import { Navigation } from "./navigation";
import { ThemeToggle } from "./theme-toggle";

export function AppHeader() {
  return <header className="ui-header-shell">
    <div className="ui-header-row">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><ShieldCheck className="h-6 w-6" aria-hidden="true" /></div>
        <div className="min-w-0"><div className="text-lg font-semibold tracking-tight text-foreground">AgentTrust</div>
          <div className="hidden whitespace-nowrap text-[11px] text-muted xl:block">AI Agent Security &amp; Observability</div>
        </div>
      </div>
      <Navigation />
      <div className="justify-self-end"><ThemeToggle /></div>
    </div>
  </header>;
}
