import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { translator, type StringKey } from "./i18n";
import type { HomeAssistant } from "./types";

// Visual editors. They use Home Assistant's own <ha-form>, which is loaded whenever the
// card editor dialog is open, so the cards bring no form code of their own.

const DEVICE = { name: "device_id", required: true, selector: { device: { integration: "mqtt" } } };
const NAME = { name: "name", selector: { text: {} } };
const POWER_SENSOR = { name: "power_sensor", selector: { entity: { domain: "sensor", device_class: "power" } } };

const CARD_SCHEMA = [
  DEVICE,
  NAME,
  {
    type: "grid",
    name: "",
    schema: [
      { name: "target_ratio", selector: { number: { min: 1, max: 4, step: 0.05, mode: "box" } } },
      { name: "ready_band", selector: { number: { min: 0.1, max: 2, step: 0.1, mode: "box" } } },
    ],
  },
  { name: "compact", selector: { boolean: {} } },
  { name: "power_switch", selector: { entity: { domain: "switch" } } },
  POWER_SENSOR,
];

const TREND_SCHEMA = [
  DEVICE,
  NAME,
  {
    type: "grid",
    name: "",
    schema: [
      { name: "hours", selector: { number: { min: 0.25, max: 24, step: 0.25, mode: "box", unit_of_measurement: "h" } } },
      { name: "ready_band", selector: { number: { min: 0.1, max: 2, step: 0.1, mode: "box" } } },
    ],
  },
  POWER_SENSOR,
];

class Leva2MqttEditorBase extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: Record<string, unknown>;
  protected schema: unknown[] = [];
  protected defaults: Record<string, unknown> = {};

  setConfig(config: Record<string, unknown>): void {
    this.config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this.config) return nothing;
    const t = translator(this.hass.locale?.language ?? this.hass.language);
    return html`<ha-form
      .hass=${this.hass}
      .data=${{ ...this.defaults, ...this.config }}
      .schema=${this.schema}
      .computeLabel=${(s: { name: string }) => (s.name === "device_id" ? t("device") : t(s.name as StringKey))}
      @value-changed=${this.changed}
    ></ha-form>`;
  }

  private changed(ev: CustomEvent<{ value: Record<string, unknown> }>): void {
    ev.stopPropagation();
    const config = { ...ev.detail.value };
    for (const [k, v] of Object.entries(config)) {
      if (v === "" || v === undefined || v === null) delete config[k];
    }
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
}

@customElement("leva2mqtt-card-editor")
export class Leva2MqttCardEditor extends Leva2MqttEditorBase {
  protected schema = CARD_SCHEMA;
  protected defaults = { target_ratio: 2, ready_band: 0.5 };
}

@customElement("leva2mqtt-trend-card-editor")
export class Leva2MqttTrendCardEditor extends Leva2MqttEditorBase {
  protected schema = TREND_SCHEMA;
  protected defaults = { hours: 1, ready_band: 0.5 };
}

declare global {
  interface HTMLElementTagNameMap {
    "leva2mqtt-card-editor": Leva2MqttCardEditor;
    "leva2mqtt-trend-card-editor": Leva2MqttTrendCardEditor;
  }
}
