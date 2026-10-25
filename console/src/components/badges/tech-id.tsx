export function TechId({
  children,
  className = "",
  title,
  wrap = false,
}: {
  children: string;
  className?: string;
  title?: string;
  wrap?: boolean;
}) {
  return (
    <span className={`ui-tech-id ${wrap ? "ui-id-wrap" : ""} ${className}`} title={title ?? children}>
      {children}
    </span>
  );
}
