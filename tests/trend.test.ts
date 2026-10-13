import { describe, expect, it } from "vitest";

import { area, downsample, parseNumeric, parseStates, path, range, spans, valueAt, windowed } from "../src/trend";

describe("trend helpers", () => {
  it("parses numbers and turns unavailable into gaps", () => {
    const pts = parseNumeric([
      { s: "90.1", lu: 100 },
      { s: "unavailable", lu: 110 },
      { s: "89.5", lc: 120 },
    ]);
    expect(pts[0]).toEqual({ t: 100, v: 90.1 });
    expect(Number.isNaN(pts[1].v)).toBe(true);
    expect(pts[2]).toEqual({ t: 120, v: 89.5 });
  });

  it("finds state spans and merges neighbours", () => {
    const st = parseStates([
      { s: "ready", lu: 0 },
      { s: "brewing", lu: 10 },
      { s: "brewing", lu: 20 },
      { s: "ready", lu: 31 },
      { s: "brewing", lu: 50 },
    ]);
    expect(spans(st, (s) => s === "brewing", 0, 60)).toEqual([
      [10, 31],
      [50, 60],
    ]);
    expect(spans(st, (s) => s === "brewing", 15, 40)).toEqual([[15, 31]]);
  });

  it("holds the last value", () => {
    const pts = [
      { t: 0, v: 1 },
      { t: 10, v: 2 },
      { t: 20, v: NaN },
    ];
    expect(valueAt(pts, -1)).toBeUndefined();
    expect(valueAt(pts, 5)).toBe(1);
    expect(valueAt(pts, 10)).toBe(2);
    expect(valueAt(pts, 25)).toBeUndefined();
  });

  it("keeps the point before the window", () => {
    const pts = [
      { t: 0, v: 1 },
      { t: 10, v: 2 },
      { t: 20, v: 3 },
    ];
    expect(windowed(pts, 15)).toEqual([pts[1], pts[2]]);
    expect(windowed(pts, 30)).toEqual([pts[2]]);
  });

  it("keeps peaks when downsampling", () => {
    const pts = Array.from({ length: 1000 }, (_, i) => ({ t: i, v: i === 500 ? 99 : 1 }));
    const out = downsample(pts, 0, 1000, 50);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.some((p) => p.v === 99)).toBe(true);
  });

  it("draws steps, gaps and the line to the end", () => {
    const s = { x: (t: number) => t, y: (v: number) => 100 - v };
    expect(path([{ t: 0, v: 10 }, { t: 10, v: 20 }], s, 15)).toBe("M0 90 L10 80 L15 80");
    expect(path([{ t: 0, v: 10 }, { t: 10, v: 20 }], s, 10, true)).toBe("M0 90 L10 90 L10 80 L10 80");
    expect(path([{ t: 0, v: 10 }, { t: 5, v: NaN }, { t: 10, v: 20 }], s, 10)).toBe("M0 90M10 80 L10 80");
  });

  it("closes areas per segment", () => {
    expect(area("M0 90 L10 80", 100)).toBe("M0 100 L0 90 L10 80 L10 100 Z");
  });

  it("pads the range to a minimum span", () => {
    expect(range([[{ t: 0, v: 90 }, { t: 1, v: 90.2 }]], 4)).toEqual([88, 93]);
    expect(range([[]], 4)).toEqual([0, 4]);
  });
});
