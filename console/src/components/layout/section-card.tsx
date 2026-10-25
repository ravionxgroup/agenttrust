import type { ComponentPropsWithoutRef } from "react";

export function SectionCard({
  children,
  className = "",
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return <section {...props} className={`ui-card ${className}`}>{children}</section>;
}
