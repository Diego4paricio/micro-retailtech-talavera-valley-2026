export function Skeleton({
  lines = 3,
  label = "Cargando…",
}: {
  lines?: number | undefined;
  label?: string | undefined;
}) {
  return (
    <div aria-busy="true" aria-live="polite" className="skeleton" role="status">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <span
          aria-hidden="true"
          className="skeleton-line"
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          key={index}
          style={{ width: `${92 - index * 14}%` }}
        />
      ))}
    </div>
  );
}
