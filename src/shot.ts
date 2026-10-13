// Shot curves: a live buffer while brewing and the last shot from the recorder.

export interface Pt {
  t: number; // s since the start of the pump run
  v: number;
}

export interface Series {
  pressure: Pt[];
  weight: Pt[];
  flow: Pt[];
}

export const emptySeries = (): Series => ({ pressure: [], weight: [], flow: [] });

export type SeriesKey = keyof Series;

/** Collects live values during a pump run. `t` comes from the bridge's pump time sensor. */
export class LiveBuffer {
  series: Series = emptySeries();
  private lastT = -1;

  reset(): void {
    this.series = emptySeries();
    this.lastT = -1;
  }

  get length(): number {
    return this.lastT < 0 ? 0 : this.lastT;
  }

  add(t: number, values: Partial<Record<SeriesKey, number | undefined>>): void {
    if (!Number.isFinite(t) || t < this.lastT) return;
    for (const [k, v] of Object.entries(values) as [SeriesKey, number | undefined][]) {
      if (v === undefined || !Number.isFinite(v)) continue;
      const s = this.series[k];
      const last = s[s.length - 1];
      if (last && last.t === t) last.v = v;
      else s.push({ t, v });
    }
    this.lastT = t;
  }
}

/** One state change in the compressed history format of `history/history_during_period`. */
interface CompressedState {
  s: string;
  lu?: number;
  lc?: number;
}

/**
 * Turn a recorder response into series relative to `start` (epoch seconds).
 * Non-numeric states (unavailable, unknown) are skipped.
 */
export function parseHistory(
  resp: Record<string, CompressedState[]> | undefined,
  ids: Partial<Record<SeriesKey, string>>,
  start: number,
): Series {
  const out = emptySeries();
  if (!resp) return out;
  for (const [key, id] of Object.entries(ids) as [SeriesKey, string | undefined][]) {
    if (!id) continue;
    for (const st of resp[id] ?? []) {
      const ts = st.lu ?? st.lc;
      const v = Number(st.s);
      if (ts === undefined || st.s === "" || !Number.isFinite(v)) continue;
      out[key].push({ t: Math.max(0, ts - start), v });
    }
  }
  return out;
}

export interface ChartBox {
  x0: number;
  x1: number;
  y0: number; // bottom
  y1: number; // top
  tMax: number;
  pMax: number; // bar
  wMax: number; // g, also used for flow × 10
}

export interface ChartPaths {
  pressure: string;
  weight: string;
  flowArea: string;
  end?: { x: number; pressureY?: number; weightY?: number };
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

export function buildPaths(series: Series, box: ChartBox): ChartPaths {
  const x = (t: number) => r1(box.x0 + ((box.x1 - box.x0) * Math.min(t, box.tMax)) / box.tMax);
  const y = (v: number, max: number) => r1(box.y0 - ((box.y0 - box.y1) * Math.min(Math.max(v, 0), max)) / max);
  const line = (pts: Pt[], max: number) =>
    pts.length < 2 ? "" : "M" + pts.map((p) => `${x(p.t)} ${y(p.v, max)}`).join(" L");
  const flow = series.flow;
  const flowArea =
    flow.length < 2
      ? ""
      : `M${x(flow[0].t)} ${box.y0} L` +
        flow.map((p) => `${x(p.t)} ${y(p.v * 10, box.wMax)}`).join(" L") +
        ` L${x(flow[flow.length - 1].t)} ${box.y0} Z`;
  const lastP = series.pressure[series.pressure.length - 1];
  const lastW = series.weight[series.weight.length - 1];
  const tEnd = Math.max(lastP?.t ?? 0, lastW?.t ?? 0);
  return {
    pressure: line(series.pressure, box.pMax),
    weight: line(series.weight, box.wMax),
    flowArea,
    end: lastP || lastW
      ? {
          x: x(tEnd),
          pressureY: lastP ? y(lastP.v, box.pMax) : undefined,
          weightY: lastW ? y(lastW.v, box.wMax) : undefined,
        }
      : undefined,
  };
}

/** Recorder query for the window of one shot (start in epoch seconds). */
export function historyRequest(ids: string[], start: number, end: number): Record<string, unknown> {
  return {
    type: "history/history_during_period",
    start_time: new Date(start * 1000).toISOString(),
    end_time: new Date(end * 1000).toISOString(),
    entity_ids: ids,
    minimal_response: true,
    no_attributes: true,
    significant_changes_only: false,
  };
}
