export const NAVIGATION_ITEMS = [
  { label: "Overview", href: "/" },
  { label: "Agents", href: "/agents" },
  { label: "Runs", href: "/runs" },
  { label: "Audit", href: "/audit" },
  { label: "Tools", href: "/tools" },
  { label: "Policies", href: "/policies" },
] as const;

export function navigationState(pathname: string, href: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  const current = path === href;
  const descendant = href !== "/" && path.startsWith(href + "/");
  const invocation = href === "/audit" && path.startsWith("/invocations/");
  return { active: current || descendant || invocation, current };
}
