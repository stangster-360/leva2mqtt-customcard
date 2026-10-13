import { describe, expect, it } from "vitest";

import { matchEntities } from "../src/entities";
import { fraction, ringArc, ringPoint } from "../src/geometry";
import { ringModel } from "../src/ring";
import { LiveBuffer, buildPaths, historyRequest, parseHistory } from "../src/shot";

// entity ids as created by a bridge with machine name "Silvia Test"
const IDS = [
  "sensor.silvia_test_state",
  "sensor.silvia_test_boiler_temperature",
  "sensor.silvia_test_setpoint",
  "sensor.silvia_test_brew_pressure",
  "sensor.silvia_test_weight",
  "sensor.silvia_test_flow_by_weight",
  "sensor.silvia_test_pump_time",
  "sensor.silvia_test_last_shot",
  "sensor.silvia_test_last_shot_yield",
  "binary_sensor.silvia_test_pump",
  "binary_sensor.silvia_test_ready",
  "binary_sensor.silvia_test_maintenance_alert",
  "sensor.silvia_test_maintenance_alerts",
  "button.silvia_test_wake",
  "button.silvia_test_beep_setpoint",
  "number.silvia_test_dose",
  "text.silvia_test_bean",
];

describe("matchEntities", () => {
  it("maps the bridge entities by device prefix", () => {
    const m = matchEntities(IDS);
    expect(m.state).toBe("sensor.silvia_test_state");
    expect(m.temperature).toBe("sensor.silvia_test_boiler_temperature");
    expect(m.pump).toBe("binary_sensor.silvia_test_pump");
    expect(m.pump_time).toBe("sensor.silvia_test_pump_time");
    expect(m.alert).toBe("sensor.silvia_test_maintenance_alerts");
    expect(m.problem).toBe("binary_sensor.silvia_test_maintenance_alert");
    expect(m.report).toBe("button.silvia_test_beep_setpoint");
    expect(m.setpoint).toBe("sensor.silvia_test_setpoint");
  });

  it("leaves out entities the machine does not have", () => {
    const m = matchEntities(IDS);
    expect(m.volume).toBeUndefined();
    expect(m.flow_weight).toBe("sensor.silvia_test_flow_by_weight");
    expect("heater" in m).toBe(false);
  });

  it("lets overrides win", () => {
    const m = matchEntities(IDS, { temperature: "sensor.kessel" });
    expect(m.temperature).toBe("sensor.kessel");
  });

  it("falls back to the suffix without a state sensor", () => {
    const m = matchEntities(["sensor.x_boiler_temperature", "sensor.long_name_x_boiler_temperature"]);
    expect(m.temperature).toBe("sensor.x_boiler_temperature");
  });
});

describe("geometry", () => {
  it("places the ring ends bottom left and bottom right", () => {
    const a = ringPoint(120, 120, 96, 0);
    const b = ringPoint(120, 120, 96, 1);
    expect(a.x).toBeLessThan(120);
    expect(b.x).toBeGreaterThan(120);
    expect(a.y).toBeCloseTo(b.y, 5);
    expect(a.y).toBeGreaterThan(120);
  });

  it("uses the large arc flag beyond 180 degrees", () => {
    expect(ringArc(120, 120, 96, 0, 0.5)).toContain(" 0 0 1 ");
    expect(ringArc(120, 120, 96, 0, 0.9)).toContain(" 0 1 1 ");
    expect(ringArc(120, 120, 96, 0.5, 0.5)).toBe("");
  });

  it("clamps fractions", () => {
    expect(fraction(200, 80, 100)).toBe(1);
    expect(fraction(0, 80, 100)).toBe(0);
  });
});

describe("ringModel", () => {
  it("shows pressure and weight progress while brewing", () => {
    const m = ringModel({ state: "brewing", pressure: 6, weight: 18, targetWeight: 36, readyBand: 0.5 });
    expect(m.kind).toBe("pressure");
    expect(m.value).not.toBe("");
    expect(m.outer).not.toBe("");
  });

  it("shows the temperature dot when awake", () => {
    const m = ringModel({ state: "ready", temperature: 90.1, setpoint: 90, readyBand: 0.5 });
    expect(m.kind).toBe("temperature");
    expect(m.dot).toBeDefined();
    expect(m.band).not.toBe("");
  });

  it("works without a temperature", () => {
    const m = ringModel({ state: "standby", readyBand: 0.5 });
    expect(m.kind).toBe("cold");
    expect(m.value).toBe("");
  });
});

describe("shot data", () => {
  it("parses the compressed recorder format and skips non-numbers", () => {
    const resp = {
      "sensor.p": [
        { s: "0.0", lu: 1000.0 },
        { s: "unavailable", lu: 1000.5 },
        { s: "9.1", lu: 1007.0 },
      ],
      "sensor.w": [{ s: "42.3", lc: 1025.0 }],
    };
    const s = parseHistory(resp, { pressure: "sensor.p", weight: "sensor.w" }, 1000);
    expect(s.pressure).toEqual([
      { t: 0, v: 0 },
      { t: 7, v: 9.1 },
    ]);
    expect(s.weight).toEqual([{ t: 25, v: 42.3 }]);
    expect(s.flow).toEqual([]);
  });

  it("keeps one point per time in the live buffer and ignores time going back", () => {
    const b = new LiveBuffer();
    b.add(0, { pressure: 0, weight: 0 });
    b.add(0.25, { pressure: 1 });
    b.add(0.25, { pressure: 1.2 });
    b.add(0.1, { pressure: 5 });
    expect(b.series.pressure).toEqual([
      { t: 0, v: 0 },
      { t: 0.25, v: 1.2 },
    ]);
  });

  it("builds paths only from two points on", () => {
    const box = { x0: 0, x1: 300, y0: 100, y1: 0, tMax: 30, pMax: 12, wMax: 50 };
    const one = buildPaths({ pressure: [{ t: 0, v: 1 }], weight: [], flow: [] }, box);
    expect(one.pressure).toBe("");
    const two = buildPaths({ pressure: [{ t: 0, v: 0 }, { t: 30, v: 12 }], weight: [], flow: [] }, box);
    expect(two.pressure).toBe("M0 100 L300 0");
    expect(two.end).toEqual({ x: 300, pressureY: 0, weightY: undefined });
  });

  it("asks the recorder for the shot window", () => {
    const r = historyRequest(["sensor.p"], 1000, 1030);
    expect(r.type).toBe("history/history_during_period");
    expect(r.start_time).toBe("1970-01-01T00:16:40.000Z");
    expect(r.no_attributes).toBe(true);
  });
});
