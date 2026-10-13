// Minimal Home Assistant frontend types; only what the card uses.
import type { Key } from "./entities";

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}

/** Entry of hass.entities (entity registry, display subset). */
export interface HassEntityEntry {
  entity_id: string;
  device_id?: string | null;
  platform?: string;
}

export interface HassDevice {
  id: string;
  name?: string | null;
  name_by_user?: string | null;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities?: Record<string, HassEntityEntry>;
  devices?: Record<string, HassDevice>;
  locale?: { language: string };
  language?: string;
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
}

export interface CardConfig {
  type: string;
  /** leva2mqtt device in Home Assistant; its entities are found automatically. */
  device_id?: string;
  /** Explicit entity ids, override the automatic lookup per key. */
  entities?: Partial<Record<Key, string>>;
  name?: string;
  /** Target yield = dose × target_ratio (default 2.0). */
  target_ratio?: number;
  /** Half width of the ready band around the setpoint in K (bridge default 0.5). */
  ready_band?: number;
  /** One-row layout. */
  compact?: boolean;
  /** Optional smart plug the machine hangs on. */
  power_switch?: string;
  power_sensor?: string;
}
