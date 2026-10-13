// Time series helpers for the trend card. Times are epoch seconds. Pure, testable.

export interface TPt {
  t: number;
  v: number;
}

export interface TState {
  t: number;
  s: string;
}

interface CompressedState {
  s: string;
  lu?: number;
  lc?: number;
}

const UNKNOWN = new Set(["unknown", "unavailable", ""]);

/** Numeric points from a compressed history list; non-numeric states end a segment (NaN). */
export function parseNumeric(list: CompressedState[] | undefined): TPt[] {
  const out: TPt[] = [];
  for (const st of list ?? []) {
    const t = st.lu ?? st.lc;
    if (t === undefined) continue;
    const v = UNKNOWN.has(st.s) ? NaN : Number(st.s);
    out.push({ t, v: Number.isFinite(v) ? v : NaN });
  }
  return out;
}

export function parseStates(list: CompressedState[] | undefined): TState[] {
  const out: TState[] = [];
  for (const st of list ?? []) {
    const t = st.lu ?? st.lc;
    if (t !== undefined) out.push({ t, s: st.s });
  }
  return out;
}

/** Time spans in which the state matches, clipped to [t0, t1]. */
export function spans(states: TState[], match: (s: string) => boolean, t0: number, t1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < states.length; i++) {
    if (!match(states[i].s)) continue;
    const a = Math.max(states[i].t, t0);
    const b = Math.min(i + 1 < states.length ? states[i + 1].t : t1, t1);
    if (b > a) {
      const last = out[out.length - 1];
      if (last && last[1] >= a) last[1] = b;
      else out.push([a, b]);
    }
  }
  return out;
}

/** Last value at or before t (states hold their value until the next change). */
export function valueAt(pts: TPt[], t: number): number | undefined {
  let lo = 0;
  let hi = pts.length - 1;
  if (hi < 0 || pts[0].t > t) return undefined;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  const v = pts[lo].v;
  return Number.isFinite(v) ? v : undefined;
}

/** Points inside the window plus the one before it, so lines start at the left edge. */
export function windowed(pts: TPt[], t0: number): TPt[] {
  let i = pts.findIndex((p) => p.t >= t0);
  if (i === -1) return pts.length ? [pts[pts.length - 1]] : [];
  if (i > 0) i -= 1;
  return pts.slice(i);
}

/** Keep min and max per bucket so peaks survive on long windows. */
export function downsample(pts: TPt[], t0: number, t1: number, buckets: number): TPt[] {
  if (pts.length <= buckets * 2) return pts;
  const out: TPt[] = [];
  const w = (t1 - t0) / buckets;
  let cur = -Infinity;
  let min: TPt | undefined;
  let max: TPt | undefined;
  const flush = () => {
    if (min && max) {
      if (min === max) out.push(min);
      else if (min.t < max.t) out.push(min, max);
      else out.push(max, min);
    }
    min = max = undefined;
  };
  for (const p of pts) {
    const b = Math.floor((p.t - t0) / w);
    if (b !== cur || !Number.isFinite(p.v)) {
      flush();
      cur = b;
    }
    if (!Number.isFinite(p.v)) {
      out.push(p); // keep gaps
      continue;
    }
    if (!min || p.v < min.v) min = p;
    if (!max || p.v > max.v) max = p;
  }
  flush();
  return out;
}

export interface Scale {
  x: (t: number) => number;
  y: (v: number) => number;
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * SVG path; `step` holds each value until the next point (for setpoint and spread).
 * The line is extended to `tEnd` with the last value. NaN values break the line.
 */
export function path(pts: TPt[], s: Scale, tEnd: number, step = false): string {
  let d = "";
  let pen = false;
  let prev: TPt | undefined;
  for (const p of pts) {
    if (!Number.isFinite(p.v)) {
      pen = false;
      prev = undefined;
      continue;
    }
    const x = r1(s.x(p.t));
    const y = r1(s.y(p.v));
    if (!pen) {
      d += `M${x} ${y}`;
      pen = true;
    } else {
      if (step && prev) d += ` L${x} ${r1(s.y(prev.v))}`;
      d += ` L${x} ${y}`;
    }
    prev = p;
  }
  if (pen && prev) d += ` L${r1(s.x(tEnd))} ${r1(s.y(prev.v))}`;
  return d;
}

/** Closed area under a line down to the baseline y0. */
export function area(line: string, y0: number): string {
  if (!line) return "";
  return line
    .split("M")
    .filter(Boolean)
    .map((seg) => {
      const pts = seg.trim().split(" L");
      const first = pts[0].split(" ")[0];
      const last = pts[pts.length - 1].split(" ")[0];
      return `M${first} ${y0} L${seg.trim()} L${last} ${y0} Z`;
    })
    .join(" ");
}

/** Rounded min / max over finite values, padded, at least `span` wide. */
export function range(series: TPt[][], span: number, pad = 0.15): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) for (const p of s) if (Number.isFinite(p.v)) {
    lo = Math.min(lo, p.v);
    hi = Math.max(hi, p.v);
  }
  if (!Number.isFinite(lo)) return [0, span];
  const mid = (lo + hi) / 2;
  const half = Math.max(span / 2, ((hi - lo) / 2) * (1 + pad));
  return [Math.floor(mid - half), Math.ceil(mid + half)];
}
