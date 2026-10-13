// Entities published by the leva2mqtt bridge via MQTT discovery.
//
// key -> [domain, default object id suffix]. The suffix is what Home Assistant derives
// from the bridge's English entity name ("Boiler temperature" -> "boiler_temperature"),
// prefixed with the device name ("silvia_test_boiler_temperature").
export const ENTITIES = {
  state: ["sensor", "state"],
  temperature: ["sensor", "boiler_temperature"],
  setpoint: ["sensor", "setpoint"],
  heater: ["sensor", "heater_output"],
  heater_avg: ["sensor", "heater_output_last_minute"],
  heater_avg_spread: ["sensor", "heater_average_spread"],
  pressure: ["sensor", "brew_pressure"],
  weight: ["sensor", "weight"],
  flow_weight: ["sensor", "flow_by_weight"],
  volume: ["sensor", "flow_meter_volume"],
  profile: ["sensor", "profile"],
  pump_time: ["sensor", "pump_time"],
  alert: ["sensor", "maintenance_alerts"],
  pending: ["sensor", "shots_waiting_for_delivery"],
  last_shot: ["sensor", "last_shot"],
  last_shot_yield: ["sensor", "last_shot_yield"],
  last_shot_duration: ["sensor", "last_shot_duration"],
  pump: ["binary_sensor", "pump"],
  heating: ["binary_sensor", "heating_up"],
  at_temperature: ["binary_sensor", "boiler_at_temperature"],
  ready: ["binary_sensor", "ready"],
  steam: ["binary_sensor", "steam_mode"],
  hot_water: ["binary_sensor", "hot_water"],
  problem: ["binary_sensor", "maintenance_alert"],
  other_client: ["binary_sensor", "other_client_connected"],
  wake: ["button", "wake"],
  eco: ["button", "eco"],
  standby: ["button", "standby"],
  report: ["button", "beep_setpoint"],
  dose: ["number", "dose"],
  bean: ["text", "bean"],
  grinder_setting: ["text", "grinder_setting"],
  visualizer_upload: ["switch", "upload_shots_to_visualizer"],
  telegram_notify: ["switch", "telegram_shot_message"],
} as const;

export type Key = keyof typeof ENTITIES;
export type EntityMap = Partial<Record<Key, string>>;

/**
 * Map the entity ids of one device to the bridge's keys.
 *
 * The device prefix is taken from the state sensor (`sensor.<prefix>_state`); then every
 * key is matched exactly as `<domain>.<prefix>_<suffix>`. Entities the user renamed are
 * found only through `overrides`. Keys without an entity are left out, as the bridge
 * leaves out sensors a machine does not have.
 */
export function matchEntities(entityIds: string[], overrides: EntityMap = {}): EntityMap {
  const ids = new Set(entityIds);
  const stateId = entityIds.find((id) => id.startsWith("sensor.") && id.endsWith("_state"));
  const prefix = stateId ? stateId.slice("sensor.".length, -"_state".length) : undefined;
  const out: EntityMap = {};
  for (const key of Object.keys(ENTITIES) as Key[]) {
    const [domain, suffix] = ENTITIES[key];
    let id: string | undefined;
    if (prefix !== undefined && ids.has(`${domain}.${prefix}_${suffix}`)) {
      id = `${domain}.${prefix}_${suffix}`;
    } else {
      // fallback: the shortest id of the right domain that ends with the suffix
      id = entityIds
        .filter((e) => e.startsWith(`${domain}.`) && e.endsWith(`_${suffix}`))
        .sort((a, b) => a.length - b.length)[0];
    }
    if (id) out[key] = id;
  }
  for (const [key, id] of Object.entries(overrides)) {
    if (id) out[key as Key] = id;
  }
  return out;
}

/** Entity ids that belong to a device, from hass.entities. */
export function deviceEntityIds(
  entities: Record<string, { entity_id: string; device_id?: string | null }> | undefined,
  deviceId: string | undefined,
): string[] {
  if (!entities || !deviceId) return [];
  return Object.values(entities)
    .filter((e) => e.device_id === deviceId)
    .map((e) => e.entity_id);
}
