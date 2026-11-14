/** Bottom-flush, top-rounded rect path — the landing's bar shape (esquinas
 * superiores redondeadas 4 px), reused across every bar chart here. */
export function roundedTopRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const r = Math.min(radius, width / 2, Math.max(height, 0));
  if (height <= 0 || width <= 0) return "";
  return `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`;
}

/** The landing's validated 5-tone teal ramp, darkest = busiest. */
export const heatRamp = [
  "#74b9c0",
  "#3f9ca6",
  "#1b8490",
  "#0a6c78",
  "#064d56",
] as const;

/** A ramp step (0–1) as a `heatRamp` color. */
export function heatStep(level: number): string {
  const index = Math.min(
    heatRamp.length - 1,
    Math.max(0, Math.floor(level * heatRamp.length)),
  );
  return heatRamp[index] ?? heatRamp[0];
}
