// What the ring shows for a machine state. Pure, so it can be tested without a browser.
import { fraction, ringArc, ringPoint, type Point } from "./geometry";

export interface RingInput {
  state?: string;
  temperature?: number;
  setpoint?: number;
  pressure?: number;
  weight?: number;
  targetWeight?: number;
  readyBand: number;
}

export interface RingModel {
  kind: "temperature" | "pressure" | "cold";
  track: string;
  band: string;
  value: string;
  outerTrack: string;
  outer: string;
  tick?: { a: Point; b: Point };
  dot?: Point;
  lo: string;
  hi: string;
}

export const SIZE = 240;
const C = SIZE / 2;
const R = 96;
const RO = 111;

const COLD_STATES = new Set(["offline", "standby", "eco"]);

export function ringModel(i: RingInput): RingModel {
  const track = ringArc(C, C, R, 0, 1);
  const sp = i.setpoint ?? 90;

  if (i.state === "brewing") {
    const max = 12;
    const p = i.pressure ?? 0;
    const target = i.targetWeight && i.targetWeight > 0 ? i.targetWeight : undefined;
    return {
      kind: "pressure",
      track,
      band: ringArc(C, C, R, 8 / max, 10 / max),
      value: ringArc(C, C, R, 0, p / max),
      outerTrack: target ? ringArc(C, C, RO, 0, 1) : "",
      outer: target && i.weight !== undefined ? ringArc(C, C, RO, 0, i.weight / target) : "",
      tick: tickAt(9 / max),
      lo: "0",
      hi: `${max} bar`,
    };
  }

  if (i.state === "steam" || COLD_STATES.has(i.state ?? "")) {
    const lo = 20;
    const hi = i.state === "steam" ? 140 : sp + 6;
    const t = i.temperature;
    return {
      kind: "cold",
      track,
      band: ringArc(C, C, R, fraction(sp - i.readyBand, lo, hi), fraction(sp + i.readyBand, lo, hi)),
      value: t === undefined ? "" : ringArc(C, C, R, 0, fraction(t, lo, hi)),
      outerTrack: "",
      outer: "",
      tick: tickAt(fraction(sp, lo, hi)),
      lo: `${lo}°`,
      hi: `${hi}°`,
    };
  }

  // awake: a window of ±6 K around the setpoint with the ready band
  const lo = sp - 6;
  const hi = sp + 6;
  return {
    kind: "temperature",
    track,
    band: ringArc(C, C, R, fraction(sp - i.readyBand, lo, hi), fraction(sp + i.readyBand, lo, hi)),
    value: "",
    outerTrack: "",
    outer: "",
    tick: tickAt(fraction(sp, lo, hi)),
    dot: i.temperature === undefined ? undefined : ringPoint(C, C, R, fraction(i.temperature, lo, hi)),
    lo: `${Math.round(lo)}°`,
    hi: `${Math.round(hi)}°`,
  };
}

function tickAt(f: number): { a: Point; b: Point } {
  return { a: ringPoint(C, C, R - 12, f), b: ringPoint(C, C, R + 12, f) };
}

/** Label positions below the two ends of the ring. */
export const LABEL_LO = { ...ringPoint(C, C, R, 0), dy: 22 };
export const LABEL_HI = { ...ringPoint(C, C, R, 1), dy: 22 };
