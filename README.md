# leva2mqtt card

A Home Assistant dashboard card for an espresso machine bridged by
[leva2mqtt](https://github.com/stangster-360/leva2mqtt) (Rancilio Silvia with an ito module
and leva! firmware).

> **Status: first scaffold, not yet run inside Home Assistant.** It renders against a fake
> `hass` object (`dev/index.html`) and the unit tests pass.

| Ready | Brewing |
|---|---|
| ![Card while ready: boiler gauge with ready band, last shot curve](docs/images/card-ready.png) | ![Card while brewing: pressure gauge, weight ring and live curve](docs/images/card-brewing.png) |

| Light theme | Standby |
|---|---|
| ![Card in the light theme](docs/images/card-ready-light.png) | ![Card in standby with the wake button](docs/images/card-standby.png) |

Compact layout:

![Compact card while ready](docs/images/card-compact-ready.png)
![Compact card while brewing](docs/images/card-compact-brewing.png)

The screenshots are rendered from `dev/index.html` with sample values (the curve is
synthetic, modelled on a 21.4 s / 42.3 g shot), not from a live machine. Icons there come
from `@mdi/js`; inside Home Assistant the card uses `ha-icon`.

## What it shows

- **The ring is the gauge.** Awake: boiler temperature in a ±6 K window around the setpoint,
  with the ready band (±0.5 K, the bridge's default) and a tick at the setpoint. Brewing:
  brew pressure 0–12 bar, and an outer ring that fills with the weight up to the target
  yield (dose × target ratio). Standby / eco: the boiler cooling down.
- **Next to the ring** three values that fit the state: heater output and stability while
  idle, weight, flow and ratio while brewing.
- **Shot curve.** Live while brewing (collected from the entity updates, timed by the
  bridge's pump time sensor). Afterwards the last shot, read from the Home Assistant
  recorder for the window of `last_shot` (start, duration, 5 s drip), with a link to
  Visualizer once the bridge has uploaded the shot.
- **Recipe chips** for dose, bean and grinder setting; a tap opens the entity to edit it.
- **Actions**: wake, eco, standby, setpoint beep, and an optional smart plug that needs a
  second tap within 3 s to switch off.
- **Maintenance alert** banner while the bridge reports one.

Entities the machine does not have are left out, as the bridge leaves them out.

## Install (HACS)

1. HACS → three-dot menu → *Custom repositories* → add
   `https://github.com/stangster-360/leva2mqtt-customcard`, type *Dashboard*.
2. Install *leva2mqtt card*, reload the browser.
3. Add the card *leva2mqtt espresso card* and pick the leva2mqtt device.

## Configuration

```yaml
type: custom:leva2mqtt-card
device_id: 0123456789abcdef      # the leva2mqtt device (picked in the editor)
name: Silvia                     # optional, default: device name
target_ratio: 2.0                # target yield = dose × ratio
ready_band: 0.5                  # K, as bridge.ready_band
compact: false                   # one-row layout
power_switch: switch.silvia_plug # optional smart plug
power_sensor: sensor.silvia_plug_power
entities:                        # optional, only for renamed entities
  temperature: sensor.my_boiler
```

The card finds the bridge's entities on the device by their default entity ids
(`sensor.<device>_boiler_temperature`, …). Renamed entities can be set under `entities`;
the keys are listed in [src/entities.ts](src/entities.ts).

Colours follow the Home Assistant theme. The state colours can be set in a theme:
`leva2mqtt-ready-color`, `leva2mqtt-heat-color`, `leva2mqtt-brew-color`,
`leva2mqtt-steam-color`, `leva2mqtt-weight-color`, `leva2mqtt-flow-color`.

The shot curve needs the recorder to keep the pressure, weight and flow sensors (they are
recorded by default). Without recorder data the card simply shows no curve.

## Development

```sh
npm install
npm test            # unit tests (vitest)
npm run typecheck
npm run build       # dist/leva2mqtt-customcard.js
npm run watch
python3 -m http.server   # then open http://localhost:8000/dev/index.html
```

`dev/index.html` renders the card against a fake `hass` with the entity ids of a bridge
named "Silvia Test" and can simulate a shot; `?theme=light` switches to the light theme.
The screenshots in `docs/images/` are taken from this page.

To release, publish a GitHub release with a new tag `v*` (or push such a tag). The
workflow builds the bundle and attaches `leva2mqtt-customcard.js` to the release; HACS
installs from the latest release.

## Not verified yet

- The card has not run inside Home Assistant yet (editor, `ha-form`, more-info, history).
- The format of `history/history_during_period` (compressed states `s` / `lu` / `lc`) is
  taken from the Home Assistant frontend, not from a capture of this setup.
