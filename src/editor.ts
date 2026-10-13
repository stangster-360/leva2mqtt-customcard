import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { translator, type StringKey } from "./i18n";
import type { CardConfig, HomeAssistant } from "./types";

// Visual editor. It uses Home Assistant's own <ha-form>, which is loaded whenever the
// card editor dialog is open, so the card brings no form code of its own.
const SCHEMA = [
  { name: "device_id", required: true, selector: { device: { integration: "mqtt" } } },
  { name: "name", selector: { text: {} } },
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
  { name: "power_sensor", selector: { entity: { domain: "sensor", device_class: "power" } } },
];

@customElement("leva2mqtt-card-editor")
export class Leva2MqttCardEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: CardConfig;

  setConfig(config: CardConfig): void {
    this.config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this.config) return nothing;
    const t = translator(this.hass.locale?.language ?? this.hass.language);
    return html`<ha-form
      .hass=${this.hass}
      .data=${{ target_ratio: 2, ready_band: 0.5, ...this.config }}
      .schema=${SCHEMA}
      .computeLabel=${(s: { name: string }) => (s.name === "device_id" ? t("device") : t(s.name as StringKey))}
      @value-changed=${this.changed}
    ></ha-form>`;
  }

  private changed(ev: CustomEvent<{ value: CardConfig }>): void {
    ev.stopPropagation();
    const config = { ...ev.detail.value };
    for (const [k, v] of Object.entries(config)) {
      if (v === "" || v === undefined || v === null) delete (config as any)[k];
    }
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "leva2mqtt-card-editor": Leva2MqttCardEditor;
  }
}
