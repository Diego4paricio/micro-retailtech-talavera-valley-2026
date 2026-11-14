/**
 * Loading placeholder. It stays invisible for the first 300 ms (CSS), so fast
 * loads never flash, and it reserves its space so nothing shifts.
 */
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
          style={{ width: `${Math.max(38, 92 - index * 14)}%` }}
        />
      ))}
    </div>
  );
}
