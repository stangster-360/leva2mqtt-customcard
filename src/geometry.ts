// Geometry for the 270° ring: 0 is bottom left (135°), 1 is bottom right (405°),
// clockwise in screen coordinates.

export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));

export const fraction = (value: number, lo: number, hi: number): number =>
  hi === lo ? 0 : clamp((value - lo) / (hi - lo));

export interface Point {
  x: number;
  y: number;
}

export function ringPoint(cx: number, cy: number, r: number, f: number): Point {
  const a = ((135 + 270 * clamp(f)) * Math.PI) / 180;
  return { x: round(cx + r * Math.cos(a)), y: round(cy + r * Math.sin(a)) };
}

/** SVG path of the ring section from f0 to f1; empty when the section has no length. */
export function ringArc(cx: number, cy: number, r: number, f0: number, f1: number): string {
  const a = clamp(f0);
  const b = clamp(f1);
  if (b - a < 0.002) return "";
  const p = ringPoint(cx, cy, r, a);
  const q = ringPoint(cx, cy, r, b);
  const large = (b - a) * 270 > 180 ? 1 : 0;
  return `M${p.x} ${p.y} A${r} ${r} 0 ${large} 1 ${q.x} ${q.y}`;
}

const round = (v: number): number => Math.round(v * 100) / 100;
