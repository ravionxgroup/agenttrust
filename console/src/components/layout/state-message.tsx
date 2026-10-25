import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function StateMessage({ title, icon: Icon, children, role, warning = false }: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  role?: "alert";
  warning?: boolean;
}) {
  return <div role={role} className="flex min-w-0 items-start gap-3 p-6">
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-raised ${warning ? "text-failed" : "text-muted"}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </div>
    <div className="min-w-0 break-words">
      <h2 className="ui-section-title">{title}</h2>
      <div className="ui-body mt-1 space-y-2">{children}</div>
    </div>
  </div>;
}
