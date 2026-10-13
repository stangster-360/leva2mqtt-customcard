import { LitElement, html, nothing, svg, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import "./editor";
import "./trend-card";
import { deviceEntityIds, matchEntities, type EntityMap, type Key } from "./entities";
import { numberFormat, translator, type StringKey } from "./i18n";
import { LABEL_HI, LABEL_LO, SIZE, ringModel, type RingModel } from "./ring";
import { LiveBuffer, buildPaths, historyRequest, parseHistory, type Series } from "./shot";
import { styles } from "./styles";
import type { CardConfig, HomeAssistant } from "./types";

const VERSION = "0.1.0";
const TAIL_S = 5; // bridge default shots.tail
const UNKNOWN = new Set(["unknown", "unavailable", ""]);

interface Stat {
  label: string;
  value: string;
  unit: string;
  fill: number; // 0..1
  color?: string;
}

@customElement("leva2mqtt-card")
export class Leva2MqttCard extends LitElement {
  static styles = styles;

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: CardConfig;
  @state() private lastShot?: Series;
  @state() private plugArmed = false;

  private ents: EntityMap = {};
  private entsKey = "";
  private live = new LiveBuffer();
  private wasBrewing = false;
  private lastShotStart?: string;
  private armTimer?: number;

  // --- Lovelace API ------------------------------------------------------

  setConfig(config: CardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this.config = { target_ratio: 2, ready_band: 0.5, ...config };
    this.entsKey = "";
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("leva2mqtt-card-editor");
  }

  static getStubConfig(hass: HomeAssistant): Partial<CardConfig> {
    // first device that has a leva2mqtt state sensor
    const entry = Object.values(hass.entities ?? {}).find(
      (e) => e.platform === "mqtt" && e.entity_id.startsWith("sensor.") && e.entity_id.endsWith("_state") &&
        Array.isArray(hass.states[e.entity_id]?.attributes?.options) &&
        hass.states[e.entity_id].attributes.options.includes("brewing"),
    );
    return { device_id: entry?.device_id ?? undefined };
  }

  getCardSize(): number {
    return this.config?.compact ? 2 : 9;
  }

  getGridOptions(): Record<string, number> {
    return this.config?.compact
      ? { columns: 12, rows: 2, min_columns: 6, min_rows: 2 }
      : { columns: 12, min_columns: 6 };
  }

  // --- data ----------------------------------------------------------------

  protected willUpdate(changed: PropertyValues): void {
    if (!this.hass || !this.config) return;
    if (changed.has("hass") || changed.has("config")) {
      this.resolveEntities();
      this.track();
    }
  }

  private resolveEntities(): void {
    const ids = deviceEntityIds(this.hass!.entities, this.config!.device_id);
    const key = `${this.config!.device_id}|${ids.length}|${JSON.stringify(this.config!.entities ?? {})}`;
    if (key === this.entsKey) return;
    this.entsKey = key;
    this.ents = matchEntities(ids, this.config!.entities);
  }

  private raw(key: Key | string | undefined): string | undefined {
    const id = key && key.includes(".") ? key : this.ents[key as Key];
    const s = id ? this.hass?.states[id]?.state : undefined;
    return s === undefined || UNKNOWN.has(s) ? undefined : s;
  }

  private num(key: Key | string | undefined): number | undefined {
    const s = this.raw(key);
    const v = s === undefined ? NaN : Number(s);
    return Number.isFinite(v) ? v : undefined;
  }

  private attrs(key: Key): Record<string, any> {
    const id = this.ents[key];
    return (id && this.hass?.states[id]?.attributes) || {};
  }

  /** Collect live samples while brewing; load the curve of a new last shot. */
  private track(): void {
    const brewing = this.raw("state") === "brewing";
    if (brewing && !this.wasBrewing) this.live.reset();
    if (brewing) {
      const t = this.num("pump_time");
      if (t !== undefined) {
        this.live.add(t, {
          pressure: this.num("pressure"),
          weight: this.num("weight"),
          flow: this.num("flow_weight"),
        });
      }
    }
    this.wasBrewing = brewing;

    const start = this.raw("last_shot");
    if (start && start !== this.lastShotStart) {
      this.lastShotStart = start;
      void this.loadLastShot(start);
    }
  }

  private async loadLastShot(startIso: string): Promise<void> {
    const start = Date.parse(startIso) / 1000;
    if (!Number.isFinite(start) || !this.hass) return;
    const duration = Number(this.attrs("last_shot").duration) || 40;
    const ids = { pressure: this.ents.pressure, weight: this.ents.weight, flow: this.ents.flow_weight };
    const list = Object.values(ids).filter((v): v is string => !!v);
    if (!list.length) return;
    try {
      const resp = await this.hass.callWS<Record<string, any>>(
        historyRequest(list, start - 1, start + duration + TAIL_S + 1),
      );
      if (this.lastShotStart === startIso) this.lastShot = parseHistory(resp, ids, start);
    } catch (err) {
      // no recorder data (excluded entities, purged, no permission): the card shows no curve
      console.debug("leva2mqtt-card: history not available", err);
    }
  }

  // --- actions -------------------------------------------------------------

  private press(key: Key): void {
    const id = this.ents[key];
    if (id) void this.hass?.callService("button", "press", { entity_id: id });
  }

  private moreInfo(entityId: string | undefined): void {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  private togglePlug(): void {
    const id = this.config?.power_switch;
    if (!id || !this.hass) return;
    if (this.hass.states[id]?.state !== "on") {
      void this.hass.callService("switch", "turn_on", { entity_id: id });
      return;
    }
    // switching a hot machine off hard needs a second tap within 3 s
    if (!this.plugArmed) {
      this.plugArmed = true;
      window.clearTimeout(this.armTimer);
      this.armTimer = window.setTimeout(() => (this.plugArmed = false), 3000);
      return;
    }
    this.plugArmed = false;
    void this.hass.callService("switch", "turn_off", { entity_id: id });
  }

  // --- rendering -----------------------------------------------------------

  private get t(): (k: StringKey) => string {
    return translator(this.hass?.locale?.language ?? this.hass?.language);
  }

  private fmt(v: number | undefined, digits: number): string {
    if (v === undefined) return "–";
    return numberFormat(this.hass?.locale?.language ?? this.hass?.language, digits).format(v);
  }

  private stateColor(state: string | undefined): string {
    switch (state) {
      case "ready":
        return "var(--l2m-ready)";
      case "heating":
        return "var(--l2m-heat)";
      case "brewing":
      case "hot_water":
        return "var(--l2m-brew)";
      case "steam":
        return "var(--l2m-steam)";
      default:
        return "var(--l2m-muted)";
    }
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.config || !this.hass) return nothing;
    const t = this.t;
    if (!this.config.device_id && !this.config.entities) {
      return html`<ha-card><div class="msg">${t("no_device")}</div></ha-card>`;
    }
    if (!this.ents.state) {
      return html`<ha-card><div class="msg">${t("no_entities")}</div></ha-card>`;
    }
    return this.config.compact ? this.renderCompact() : this.renderFull();
  }

  private ring(): RingModel {
    const dose = this.num("dose");
    return ringModel({
      state: this.raw("state"),
      temperature: this.num("temperature"),
      setpoint: this.num("setpoint"),
      pressure: this.num("pressure"),
      weight: this.num("weight"),
      targetWeight: dose !== undefined ? dose * (this.config!.target_ratio ?? 2) : undefined,
      readyBand: this.config!.ready_band ?? 0.5,
    });
  }

  private ringSvg(m: RingModel, labels: boolean): TemplateResult {
    const color = this.stateColor(this.raw("state"));
    const valueColor = m.kind === "pressure" ? "var(--l2m-brew)" : m.kind === "cold" ? "var(--l2m-muted)" : color;
    return html`<svg viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true">
      <path d=${m.track} fill="none" stroke="var(--l2m-track)" stroke-width="14" stroke-linecap="round"></path>
      ${m.band ? svg`<path d=${m.band} fill="none" stroke="var(--l2m-ready)" stroke-opacity=${m.kind === "pressure" ? 0.25 : 1} stroke-width="14"></path>` : nothing}
      ${m.value ? svg`<path d=${m.value} fill="none" stroke=${valueColor} stroke-width="14" stroke-linecap="round"></path>` : nothing}
      ${m.outerTrack ? svg`<path d=${m.outerTrack} fill="none" stroke="var(--l2m-track)" stroke-width="4" stroke-linecap="round"></path>` : nothing}
      ${m.outer ? svg`<path d=${m.outer} fill="none" stroke="var(--l2m-weight)" stroke-width="4" stroke-linecap="round"></path>` : nothing}
      ${m.tick ? svg`<line x1=${m.tick.a.x} y1=${m.tick.a.y} x2=${m.tick.b.x} y2=${m.tick.b.y} stroke="var(--primary-text-color)" stroke-opacity="0.6" stroke-width="2"></line>` : nothing}
      ${m.dot ? svg`<circle cx=${m.dot.x} cy=${m.dot.y} r="7" fill="var(--primary-text-color)" stroke="var(--ha-card-background, var(--card-background-color, #fff))" stroke-width="3"></circle>` : nothing}
      ${labels
        ? svg`<text x=${LABEL_LO.x} y=${LABEL_LO.y + LABEL_LO.dy} text-anchor="middle" class="ax">${m.lo}</text>
              <text x=${LABEL_HI.x} y=${LABEL_HI.y + LABEL_HI.dy} text-anchor="middle" class="ax">${m.hi}</text>`
        : nothing}
    </svg>`;
  }

  private center(): { top: string; big: string; unit: string; bottom: string } {
    const t = this.t;
    const st = this.raw("state");
    if (st === "brewing") {
      return { top: t("pump"), big: this.fmt(this.num("pump_time"), 1), unit: "s", bottom: `${this.fmt(this.num("pressure"), 1)} bar` };
    }
    const sp = this.num("setpoint");
    return {
      top: t("boiler"),
      big: this.fmt(this.num("temperature"), 1),
      unit: "°",
      bottom: sp !== undefined ? `${t("setpoint")} ${this.fmt(sp, 1)}` : "",
    };
  }

  private stats(): Stat[] {
    const t = this.t;
    const st = this.raw("state");
    const out: (Stat | undefined)[] = [];
    if (st === "brewing") {
      const w = this.num("weight");
      const f = this.num("flow_weight");
      const dose = this.num("dose");
      const target = dose !== undefined ? dose * (this.config!.target_ratio ?? 2) : undefined;
      out.push(w === undefined ? undefined : { label: t("weight"), value: this.fmt(w, 1), unit: "g", fill: target ? w / target : 0, color: "var(--l2m-weight)" });
      out.push(f === undefined ? undefined : { label: t("flow"), value: this.fmt(f, 1), unit: "g/s", fill: f / 4, color: "var(--l2m-flow)" });
      // no ratio before the first drop
      out.push(w === undefined || !dose || w < 0.2 ? undefined : { label: t("ratio"), value: `1 : ${this.fmt(w / dose, 2)}`, unit: "", fill: w / dose / (this.config!.target_ratio ?? 2) });
    } else {
      const h = this.num("heater");
      // the spread only means something while the machine holds its setpoint
      const awake = st !== "standby" && st !== "eco" && st !== "offline";
      const spread = awake ? this.num("heater_avg_spread") : undefined;
      const watt = this.num(this.config!.power_sensor);
      const pending = this.num("pending");
      out.push(h === undefined ? undefined : { label: t("heater"), value: this.fmt(h, 0), unit: "%", fill: h / 100, color: "var(--l2m-heat)" });
      // ready needs a spread below 1.0 %-points (bridge default)
      out.push(spread === undefined ? undefined : { label: t("stability"), value: this.fmt(spread, 1), unit: "%-P.", fill: 1 - Math.min(spread, 2) / 2, color: spread < 1 ? "var(--l2m-ready)" : "var(--l2m-heat)" });
      out.push(watt === undefined ? undefined : { label: t("plug"), value: this.fmt(watt, 0), unit: "W", fill: watt / 1200 });
      if (pending) out.push({ label: t("pending"), value: this.fmt(pending, 0), unit: "", fill: 0 });
    }
    return out.filter((s): s is Stat => !!s).slice(0, 3);
  }

  private renderChart(): TemplateResult | typeof nothing {
    const t = this.t;
    const brewing = this.raw("state") === "brewing";
    const series = brewing ? this.live.series : this.lastShot;
    if (!series || (!series.pressure.length && !series.weight.length)) return nothing;
    const shot = this.attrs("last_shot");
    const dose = this.num("dose");
    const target = dose !== undefined ? dose * (this.config!.target_ratio ?? 2) : undefined;
    const wMax = Math.max(50, Math.ceil(((target ?? 40) * 1.25) / 10) * 10);
    const box = { x0: 22, x1: 478, y0: 112, y1: 12, tMax: 30, pMax: 12, wMax };
    const p = buildPaths(series, box);
    const targetY = target !== undefined ? Math.round((box.y0 - ((box.y0 - box.y1) * target) / wMax) * 10) / 10 : undefined;
    const title = brewing ? t("live") : t("last_shot");
    const meta = brewing
      ? ""
      : [
          shot.ratio !== undefined ? `1 : ${this.fmt(Number(shot.ratio), 2)}` : undefined,
          shot.yield !== undefined ? `${this.fmt(Number(shot.yield), 1)} g` : undefined,
          shot.duration !== undefined ? `${this.fmt(Number(shot.duration), 1)} s` : undefined,
        ].filter(Boolean).join(" · ");
    return html`<div class="chart">
      <div class="row"><span>${title}</span><span class="k">${meta}</span></div>
      <svg viewBox="0 0 500 132" role="img" aria-label=${title}>
        <line x1="22" x2="478" y1="112" y2="112" stroke="var(--l2m-track)"></line>
        <line x1="22" x2="478" y1="62" y2="62" stroke="var(--l2m-track)" stroke-opacity="0.5"></line>
        <text x="18" y="115" text-anchor="end" class="ax">0</text>
        <text x="18" y="65" text-anchor="end" class="ax">6</text>
        <text x="18" y="15" text-anchor="end" class="ax">12</text>
        <text x="482" y="15" class="ax">${wMax} g</text>
        ${targetY !== undefined
          ? svg`<line x1="22" x2="478" y1=${targetY} y2=${targetY} stroke="var(--l2m-weight)" stroke-opacity="0.4" stroke-dasharray="6 4"></line>
                <text x="476" y=${targetY - 4} text-anchor="end" class="ax">${t("target")} ${this.fmt(target, 0)} g</text>`
          : nothing}
        ${p.flowArea ? svg`<path d=${p.flowArea} fill="var(--l2m-flow)" fill-opacity="0.14"></path>` : nothing}
        ${p.weight ? svg`<path d=${p.weight} fill="none" stroke="var(--l2m-weight)" stroke-width="2.5" stroke-linejoin="round"></path>` : nothing}
        ${p.pressure ? svg`<path d=${p.pressure} fill="none" stroke="var(--l2m-brew)" stroke-width="2.5" stroke-linejoin="round"></path>` : nothing}
        ${brewing && p.end?.pressureY !== undefined ? svg`<circle cx=${p.end.x} cy=${p.end.pressureY} r="4" fill="var(--l2m-brew)"></circle>` : nothing}
        ${brewing && p.end?.weightY !== undefined ? svg`<circle cx=${p.end.x} cy=${p.end.weightY} r="4" fill="var(--l2m-weight)"></circle>` : nothing}
        <text x="22" y="128" class="ax">0 s</text>
        <text x="250" y="128" text-anchor="middle" class="ax">15 s</text>
        <text x="478" y="128" text-anchor="end" class="ax">30 s</text>
      </svg>
      <div class="legend">
        <span style="--c: var(--l2m-brew)"><i></i>${t("pressure")} bar</span>
        <span style="--c: var(--l2m-weight)"><i></i>${t("weight")} g</span>
        <span style="--c: var(--l2m-flow)"><i></i>${t("flow")}</span>
        ${!brewing && shot.visualizer_url
          ? html`<a href=${shot.visualizer_url} target="_blank" rel="noreferrer">Visualizer ↗</a>`
          : nothing}
      </div>
    </div>`;
  }

  private renderActions(): TemplateResult {
    const t = this.t;
    const st = this.raw("state");
    const cold = st === "standby" || st === "eco" || st === "offline";
    const btn = (key: Key, icon: string, label: StringKey, primary = false) =>
      this.ents[key]
        ? html`<button class="act ${primary ? "primary" : ""}" @click=${() => this.press(key)} aria-label=${t(label)} title=${t(label)}>
            <ha-icon icon=${icon}></ha-icon>${primary ? t(label) : nothing}
          </button>`
        : nothing;
    const plug = this.config!.power_switch;
    return html`
      ${cold ? html`<div class="actions">${btn("wake", "mdi:power", "wake", true)}</div>` : nothing}
      <div class="actions">
        ${cold ? nothing : btn("wake", "mdi:power", "wake")} ${btn("eco", "mdi:leaf", "eco")}
        ${btn("standby", "mdi:power-sleep", "standby")} ${btn("report", "mdi:volume-high", "beep")}
        ${plug
          ? html`<button class="act ${this.plugArmed ? "armed" : ""}" @click=${this.togglePlug}
              aria-label=${this.plugArmed ? t("plug_off_confirm") : t("plug")} title=${t("plug")}>
              <ha-icon icon="mdi:power-plug"></ha-icon>${this.plugArmed ? t("plug_off_confirm") : nothing}
            </button>`
          : nothing}
      </div>`;
  }

  private renderFull(): TemplateResult {
    const t = this.t;
    const st = this.raw("state");
    const color = this.stateColor(st);
    const ring = this.ring();
    const c = this.center();
    const alert = this.raw("alert");
    const dose = this.num("dose");
    const bean = this.raw("bean");
    const grind = this.raw("grinder_setting");
    const name = this.config!.name ?? this.deviceName() ?? "Espresso";
    return html`<ha-card>
      <div class="head">
        <div class="title">
          <span class="name">${name}</span>
          <span class="sub">${[this.raw("profile")].filter(Boolean).join(" · ")}</span>
        </div>
        <span class="chip ${st === "brewing" ? "live" : ""}" style="--c: ${color}">
          <span class="dot"></span>${st ? t(`state.${st}` as StringKey) : "–"}
        </span>
      </div>

      ${alert && alert !== "none"
        ? html`<div class="alert" role="status"><ha-icon icon="mdi:alert-outline"></ha-icon>${alert}</div>`
        : nothing}

      <div class="hero">
        <div class="ring">
          ${this.ringSvg(ring, true)}
          <div class="center">
            <span class="top">${c.top}</span>
            <span class="big">${c.big}<small>${c.unit}</small></span>
            <span class="bottom">${c.bottom}</span>
          </div>
        </div>
        <div class="side">
          ${this.stats().map(
            (s) => html`<div class="stat" style=${s.color ? `--c: ${s.color}` : ""}>
              <span class="k">${s.label}</span>
              <span class="v">${s.value}<small>${s.unit}</small></span>
              <div class="bar"><div style="width: ${Math.round(Math.min(1, Math.max(0, s.fill)) * 100)}%"></div></div>
            </div>`,
          )}
        </div>
      </div>

      ${this.renderChart()}

      <div class="chips">
        ${dose !== undefined
          ? html`<button class="rchip" @click=${() => this.moreInfo(this.ents.dose)}>
              <b>${t("recipe")}</b>${this.fmt(dose, 1)} g → ${this.fmt(dose * (this.config!.target_ratio ?? 2), 0)} g
            </button>`
          : nothing}
        ${this.ents.bean
          ? html`<button class="rchip" @click=${() => this.moreInfo(this.ents.bean)}><b>${t("bean")}</b>${bean ?? "–"}</button>`
          : nothing}
        ${this.ents.grinder_setting
          ? html`<button class="rchip" @click=${() => this.moreInfo(this.ents.grinder_setting)}><b>${t("grind")}</b>${grind ?? "–"}</button>`
          : nothing}
      </div>

      ${this.renderActions()}
    </ha-card>`;
  }

  private renderCompact(): TemplateResult {
    const t = this.t;
    const st = this.raw("state");
    const color = this.stateColor(st);
    const c = this.center();
    const cold = st === "standby" || st === "eco" || st === "offline";
    const shot = this.attrs("last_shot");
    const line =
      st === "brewing"
        ? [`${this.fmt(this.num("pressure"), 1)} bar`, `${this.fmt(this.num("weight"), 1)} g`, `${this.fmt(this.num("flow_weight"), 1)} g/s`].join(" · ")
        : shot.yield !== undefined
          ? `${t("last_shot")} ${shot.ratio !== undefined ? `1 : ${this.fmt(Number(shot.ratio), 2)} · ` : ""}${this.fmt(Number(shot.yield), 1)} g · ${this.fmt(Number(shot.duration), 1)} s`
          : "";
    const key: Key = cold ? "wake" : "standby";
    return html`<ha-card class="compact">
      <div class="ring">${this.ringSvg(this.ring(), false)}</div>
      <div class="info">
        <div class="line">
          <span class="name" style="font-size: 16px">${this.config!.name ?? this.deviceName() ?? "Espresso"}</span>
          <span class="chip ${st === "brewing" ? "live" : ""}" style="--c: ${color}; height: 22px">
            <span class="dot"></span>${st ? t(`state.${st}` as StringKey) : "–"}
          </span>
        </div>
        <span class="k">${[`${c.big}${c.unit}`, line].filter(Boolean).join(" · ")}</span>
      </div>
      ${this.ents[key]
        ? html`<button class="act ${cold ? "primary" : ""}" @click=${() => this.press(key)} aria-label=${t(key)} title=${t(key)}>
            <ha-icon icon=${cold ? "mdi:power" : "mdi:power-sleep"}></ha-icon>
          </button>`
        : nothing}
    </ha-card>`;
  }

  private deviceName(): string | undefined {
    const d = this.config?.device_id ? this.hass?.devices?.[this.config.device_id] : undefined;
    return d?.name_by_user ?? d?.name ?? undefined;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this.armTimer);
  }
}

/** The same card in its one-row layout, listed separately in the card picker. */
@customElement("leva2mqtt-compact-card")
export class Leva2MqttCompactCard extends Leva2MqttCard {
  setConfig(config: CardConfig): void {
    super.setConfig({ compact: true, ...config });
  }
}

declare global {
  interface Window {
    customCards?: { type: string; name: string; description: string; preview?: boolean }[];
  }
  interface HTMLElementTagNameMap {
    "leva2mqtt-card": Leva2MqttCard;
    "leva2mqtt-compact-card": Leva2MqttCompactCard;
  }
}

window.customCards = window.customCards ?? [];
window.customCards.push(
  {
    type: "leva2mqtt-card",
    name: "leva2mqtt espresso card",
    description: "Live state, shot curve and controls of an espresso machine bridged by leva2mqtt.",
    preview: true,
  },
  {
    type: "leva2mqtt-compact-card",
    name: "leva2mqtt espresso card (compact)",
    description: "One row: state, boiler or pressure gauge, last shot and a wake / standby button.",
    preview: true,
  },
  {
    type: "leva2mqtt-trend-card",
    name: "leva2mqtt boiler trend",
    description: "Boiler temperature, heater output, plug power and stability over time, with shots marked.",
    preview: true,
  },
);

console.info(`%c leva2mqtt-card %c ${VERSION} `, "background:#d9963f;color:#1c140f", "");
