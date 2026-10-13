import { LitElement, css, html, nothing, svg, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { deviceEntityIds, matchEntities, type EntityMap } from "./entities";
import { numberFormat, translator, type StringKey } from "./i18n";
import { styles } from "./styles";
import {
  area,
  downsample,
  parseNumeric,
  parseStates,
  path,
  range,
  spans,
  valueAt,
  windowed,
  type Scale,
  type TPt,
  type TState,
} from "./trend";
import type { CardConfig, HomeAssistant } from "./types";

type SeriesKey = "temperature" | "setpoint" | "heater" | "spread" | "power";

interface Data {
  temperature: TPt[];
  setpoint: TPt[];
  heater: TPt[];
  spread: TPt[];
  power: TPt[];
  states: TState[];
}

const empty = (): Data => ({ temperature: [], setpoint: [], heater: [], spread: [], power: [], states: [] });

const WINDOWS = [5 / 60, 0.25, 1, 6, 24];
const W = 600;
const L = 40;
const R = 590;
const SPREAD_LIMIT = 1.0; // ready needs a spread below 1.0 %-points (bridge default)
const ASLEEP = new Set(["standby", "eco", "offline"]);

interface Strip {
  key: SeriesKey;
  label: StringKey;
  unit: string;
  top: number;
  height: number;
}

@customElement("leva2mqtt-trend-card")
export class Leva2MqttTrendCard extends LitElement {
  static styles = [
    styles,
    css`
      ha-card {
        gap: 10px;
      }
      .tabs {
        display: flex;
        gap: 2px;
        padding: 3px;
        border-radius: 18px;
        background: var(--l2m-surface);
      }
      .tabs button {
        appearance: none;
        border: none;
        background: transparent;
        color: var(--l2m-muted);
        font: inherit;
        font-size: 12px;
        min-width: 44px;
        height: 30px;
        border-radius: 15px;
        cursor: pointer;
      }
      .tabs button[aria-pressed="true"] {
        background: var(--ha-card-background, var(--card-background-color, #fff));
        color: var(--primary-text-color);
        font-weight: 500;
      }
      .values {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 16px;
        font-size: 12px;
        color: var(--l2m-muted);
        min-height: 18px;
      }
      .values b {
        font-weight: 500;
        color: var(--primary-text-color);
        font-variant-numeric: tabular-nums;
      }
      svg.trend {
        width: 100%;
        display: block;
        touch-action: pan-y;
        cursor: crosshair;
      }
    `,
  ];

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: CardConfig;
  @state() private hours = 1;
  @state() private data: Data = empty();
  @state() private hoverT?: number;

  private ents: EntityMap = {};
  private entsKey = "";
  private loadKey = "";
  private tick?: number;

  setConfig(config: CardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this.config = { hours: 1, ready_band: 0.5, ...config };
    this.hours = this.config.hours ?? 1;
    this.entsKey = "";
    this.loadKey = "";
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("leva2mqtt-trend-card-editor");
  }

  static getStubConfig(hass: HomeAssistant): Partial<CardConfig> {
    const entry = Object.values(hass.entities ?? {}).find(
      (e) => e.platform === "mqtt" && e.entity_id.startsWith("sensor.") && e.entity_id.endsWith("_state") &&
        hass.states[e.entity_id]?.attributes?.options?.includes?.("brewing"),
    );
    return { device_id: entry?.device_id ?? undefined, hours: 1 };
  }

  getCardSize(): number {
    return 5;
  }

  getGridOptions(): Record<string, number> {
    return { columns: 12, min_columns: 6 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    // move the time axis even when no value changes
    this.tick = window.setInterval(() => this.requestUpdate(), 30_000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.tick);
  }

  // --- data ----------------------------------------------------------------

  private ids(): Record<SeriesKey | "state", string | undefined> {
    return {
      temperature: this.ents.temperature,
      setpoint: this.ents.setpoint,
      heater: this.ents.heater,
      spread: this.ents.heater_avg_spread,
      power: this.config?.power_sensor,
      state: this.ents.state,
    };
  }

  protected willUpdate(changed: PropertyValues): void {
    if (!this.hass || !this.config) return;
    if (!changed.has("hass") && !changed.has("config") && !changed.has("hours")) return;
    const devIds = deviceEntityIds(this.hass.entities, this.config.device_id);
    const ek = `${this.config.device_id}|${devIds.length}|${JSON.stringify(this.config.entities ?? {})}`;
    if (ek !== this.entsKey) {
      this.entsKey = ek;
      this.ents = matchEntities(devIds, this.config.entities);
    }
    const lk = `${JSON.stringify(this.ids())}|${this.hours}`;
    if (lk !== this.loadKey) {
      this.loadKey = lk;
      void this.load();
    } else if (changed.has("hass")) {
      this.appendLive();
    }
  }

  private async load(): Promise<void> {
    const ids = this.ids();
    const list = Object.values(ids).filter((v): v is string => !!v);
    if (!list.length || !this.hass) return;
    const t1 = Date.now() / 1000;
    const t0 = t1 - this.hours * 3600;
    const key = this.loadKey;
    try {
      const resp = await this.hass.callWS<Record<string, any>>({
        type: "history/history_during_period",
        start_time: new Date(t0 * 1000).toISOString(),
        end_time: new Date(t1 * 1000).toISOString(),
        entity_ids: list,
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      if (key !== this.loadKey) return; // window or device changed meanwhile
      this.data = {
        temperature: parseNumeric(ids.temperature ? resp[ids.temperature] : undefined),
        setpoint: parseNumeric(ids.setpoint ? resp[ids.setpoint] : undefined),
        heater: parseNumeric(ids.heater ? resp[ids.heater] : undefined),
        spread: parseNumeric(ids.spread ? resp[ids.spread] : undefined),
        power: parseNumeric(ids.power ? resp[ids.power] : undefined),
        states: parseStates(ids.state ? resp[ids.state] : undefined),
      };
    } catch (err) {
      console.debug("leva2mqtt-trend-card: history not available", err);
    }
  }

  /** Add the current states between two history loads. */
  private appendLive(): void {
    const ids = this.ids();
    const d = this.data;
    let changed = false;
    for (const key of ["temperature", "setpoint", "heater", "spread", "power"] as SeriesKey[]) {
      const id = ids[key];
      const st = id ? this.hass!.states[id] : undefined;
      if (!st) continue;
      const t = Date.parse(st.last_updated) / 1000;
      const last = d[key][d[key].length - 1];
      if (!Number.isFinite(t) || (last && t <= last.t)) continue;
      const v = Number(st.state);
      d[key].push({ t, v: Number.isFinite(v) ? v : NaN });
      changed = true;
    }
    const sid = ids.state ? this.hass!.states[ids.state] : undefined;
    if (sid) {
      const t = Date.parse(sid.last_changed) / 1000;
      const last = d.states[d.states.length - 1];
      if (Number.isFinite(t) && (!last || (t > last.t && sid.state !== last.s))) {
        d.states.push({ t, s: sid.state });
        changed = true;
      }
    }
    if (changed) this.data = { ...d };
  }

  // --- rendering -----------------------------------------------------------

  private get language(): string | undefined {
    return this.hass?.locale?.language ?? this.hass?.language;
  }

  private fmt(v: number | undefined, digits: number): string {
    return v === undefined ? "–" : numberFormat(this.language, digits).format(v);
  }

  private strips(): Strip[] {
    const out: Strip[] = [{ key: "temperature", label: "boiler", unit: "°C", top: 8, height: 120 }];
    let y = 8 + 120 + 18;
    const add = (key: SeriesKey, label: StringKey, unit: string, present: boolean) => {
      if (!present) return;
      out.push({ key, label, unit, top: y, height: 44 });
      y += 44 + 18;
    };
    add("heater", "heater", "%", !!this.ents.heater);
    add("power", "plug", "W", !!this.config?.power_sensor);
    add("spread", "spread", "%-P.", !!this.ents.heater_avg_spread);
    return out;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.config || !this.hass) return nothing;
    const t = translator(this.language);
    if (!this.config.device_id && !this.config.entities) {
      return html`<ha-card><div class="msg">${t("no_device")}</div></ha-card>`;
    }
    if (!this.ents.temperature) {
      return html`<ha-card><div class="msg">${t("no_entities")}</div></ha-card>`;
    }

    const t1 = Date.now() / 1000;
    const t0 = t1 - this.hours * 3600;
    const strips = this.strips();
    const bottom = strips[strips.length - 1].top + strips[strips.length - 1].height;
    const H = bottom + 22;
    // clamped, so the point before the window starts the line at the left edge
    const x = (tt: number) => L + ((R - L) * (Math.min(Math.max(tt, t0), t1) - t0)) / (t1 - t0);
    const d = this.data;
    const band = this.config.ready_band ?? 0.5;

    const tTemp = downsample(windowed(d.temperature, t0), t0, t1, 300);
    const tSp = windowed(d.setpoint, t0);
    const [tlo, thi] = range([tTemp, tSp.map((p) => ({ t: p.t, v: p.v + band })), tSp.map((p) => ({ t: p.t, v: p.v - band }))], 4);

    const hoverT = this.hoverT;
    const at = (k: SeriesKey) => valueAt(d[k], hoverT ?? t1);
    // short windows need seconds to tell the ticks and the crosshair apart
    const timeFmt = new Intl.DateTimeFormat(this.language, {
      hour: "2-digit",
      minute: "2-digit",
      ...(this.hours < 0.25 ? { second: "2-digit" } : {}),
    });

    const shade = (match: (s: string) => boolean, color: string, opacity: number) =>
      spans(d.states, match, t0, t1).map(
        ([a, b]) => svg`<rect x=${x(a)} y="0" width=${Math.max(1, x(b) - x(a))} height=${bottom} fill=${color} fill-opacity=${opacity}></rect>`,
      );

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + f * (t1 - t0));

    const stripSvg = (s: Strip) => {
      const pts = downsample(windowed(d[s.key], t0), t0, t1, 300);
      let lo = 0;
      let hi = 100;
      if (s.key === "temperature") [lo, hi] = [tlo, thi];
      if (s.key === "power") hi = Math.max(100, Math.ceil(Math.max(0, ...pts.filter((p) => Number.isFinite(p.v)).map((p) => p.v)) / 100) * 100);
      if (s.key === "spread") hi = Math.max(2, Math.ceil(Math.max(0, ...pts.filter((p) => Number.isFinite(p.v)).map((p) => p.v))));
      const y = (v: number) => s.top + s.height - (s.height * (Math.min(Math.max(v, lo), hi) - lo)) / (hi - lo);
      const scale: Scale = { x, y };
      const step = s.key === "spread";
      const line = path(pts, scale, t1, step);
      const color =
        s.key === "temperature" ? "var(--l2m-weight)" : s.key === "heater" ? "var(--l2m-heat)" : s.key === "power" ? "var(--l2m-brew)" : "var(--primary-text-color)";
      const mid = (lo + hi) / 2;
      return svg`
        <line x1=${L} x2=${R} y1=${s.top + s.height} y2=${s.top + s.height} stroke="var(--l2m-track)"></line>
        <line x1=${L} x2=${R} y1=${y(mid)} y2=${y(mid)} stroke="var(--l2m-track)" stroke-opacity="0.5"></line>
        <text x=${L - 6} y=${s.top + 4} text-anchor="end" class="ax">${this.fmt(hi, 0)}</text>
        <text x=${L - 6} y=${s.top + s.height + 3} text-anchor="end" class="ax">${this.fmt(lo, 0)}</text>
        <text x=${L + 4} y=${s.top + 9} class="ax">${t(s.label)} ${s.unit}</text>
        ${s.key === "temperature"
          ? tSp.map((p, i) => {
              const b = i + 1 < tSp.length ? tSp[i + 1].t : t1;
              if (!Number.isFinite(p.v) || b <= t0) return nothing;
              const a = Math.max(p.t, t0);
              return svg`<rect x=${x(a)} y=${y(p.v + band)} width=${Math.max(0, x(b) - x(a))} height=${Math.max(1, y(p.v - band) - y(p.v + band))} fill="var(--l2m-ready)" fill-opacity="0.16"></rect>`;
            })
          : nothing}
        ${s.key === "temperature" && tSp.length
          ? svg`<path d=${path(tSp, scale, t1, true)} fill="none" stroke="var(--primary-text-color)" stroke-opacity="0.5" stroke-dasharray="4 4"></path>`
          : nothing}
        ${s.key === "spread"
          ? svg`<line x1=${L} x2=${R} y1=${y(SPREAD_LIMIT)} y2=${y(SPREAD_LIMIT)} stroke="var(--l2m-ready)" stroke-dasharray="4 3"></line>`
          : nothing}
        ${s.key === "heater" || s.key === "power" ? svg`<path d=${area(line, s.top + s.height)} fill=${color} fill-opacity="0.18"></path>` : nothing}
        <path d=${line} fill="none" stroke=${color} stroke-width="1.6" stroke-linejoin="round"></path>`;
    };

    const values: [StringKey, number | undefined, number, string][] = [
      ["boiler", at("temperature"), 1, "°C"],
      ["setpoint", at("setpoint"), 1, "°C"],
      ["heater", this.ents.heater ? at("heater") : undefined, 0, "%"],
      ["plug", this.config.power_sensor ? at("power") : undefined, 0, "W"],
      ["spread", this.ents.heater_avg_spread ? at("spread") : undefined, 1, "%-P."],
    ];

    return html`<ha-card>
      <div class="head">
        <div class="title">
          <span class="name">${this.config.name ?? t("trend")}</span>
          <span class="sub">${hoverT ? timeFmt.format(hoverT * 1000) : `${t("live")} · ${timeFmt.format(t1 * 1000)}`}</span>
        </div>
        <div class="tabs" role="group" aria-label=${t("hours")}>
          ${WINDOWS.map(
            (h) => html`<button aria-pressed=${String(this.hours === h)} @click=${() => (this.hours = h)}>
              ${h < 1 ? `${Math.round(h * 60)} min` : `${h} h`}
            </button>`,
          )}
        </div>
      </div>
      <div class="values">
        ${values
          .filter(([k, v]) => v !== undefined || k === "boiler" || k === "setpoint")
          .map(([k, v, digits, unit]) => html`<span>${t(k)} <b>${this.fmt(v, digits)} ${unit}</b></span>`)}
      </div>
      <svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label=${t("trend")}
        @pointermove=${(e: PointerEvent) => this.hover(e, t0, t1)} @pointerleave=${() => (this.hoverT = undefined)}>
        ${shade((s) => s === "brewing", "var(--l2m-brew)", 0.22)}
        ${shade((s) => s === "steam", "var(--l2m-steam)", 0.14)}
        ${shade((s) => ASLEEP.has(s), "var(--l2m-muted)", 0.1)}
        ${strips.map(stripSvg)}
        ${ticks.map(
          (tt, i) => svg`<text x=${x(tt)} y=${bottom + 16} text-anchor=${i === 0 ? "start" : i === 4 ? "end" : "middle"} class="ax">${timeFmt.format(tt * 1000)}</text>`,
        )}
        ${hoverT !== undefined
          ? svg`<line x1=${x(hoverT)} x2=${x(hoverT)} y1="0" y2=${bottom} stroke="var(--primary-text-color)" stroke-opacity="0.5"></line>`
          : nothing}
      </svg>
      <div class="legend">
        <span style="--c: var(--l2m-brew)"><i style="height: 8px; opacity: .5"></i>${t("shot")}</span>
        <span style="--c: var(--l2m-ready)"><i style="height: 8px; opacity: .4"></i>${t("ready_band_short")} ±${this.fmt(band, 1)} K</span>
        <span style="--c: var(--l2m-muted)"><i style="height: 8px; opacity: .4"></i>${t("asleep")}</span>
      </div>
    </ha-card>`;
  }

  private hover(e: PointerEvent, t0: number, t1: number): void {
    const el = e.currentTarget as SVGSVGElement;
    const r = el.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    if (vx < L || vx > R) {
      this.hoverT = undefined;
      return;
    }
    this.hoverT = t0 + ((vx - L) / (R - L)) * (t1 - t0);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "leva2mqtt-trend-card": Leva2MqttTrendCard;
  }
}
