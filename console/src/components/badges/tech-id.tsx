export function TechId({
  children,
  className = "",
  title,
  wrap = false,
  opaque = false,
}: {
  children: string;
  className?: string;
  title?: string;
  wrap?: boolean;
  opaque?: boolean;
}) {
  return (
    <span className={`ui-tech-id ${opaque ? "font-mono" : ""} ${wrap ? "ui-id-wrap" : ""} ${className}`} title={title ?? children}>
      {children}
    </span>
  );
}
