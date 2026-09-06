export function TechId({
  children,
  className = "",
  title,
}: {
  children: string;
  className?: string;
  title?: string;
}) {
  return (
    <span className={`ui-tech-id ${className}`} title={title ?? children}>
      {children}
    </span>
  );
}
