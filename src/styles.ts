import { css } from "lit";

// Colours follow the Home Assistant theme; the state colours can be overridden in a theme
// with the --leva2mqtt-* variables.
export const styles = css`
  :host {
    display: block;
    container-type: inline-size;
    --l2m-ready: var(--leva2mqtt-ready-color, var(--success-color, #4caf50));
    --l2m-heat: var(--leva2mqtt-heat-color, var(--warning-color, #ff9800));
    --l2m-brew: var(--leva2mqtt-brew-color, #4f9de8);
    --l2m-steam: var(--leva2mqtt-steam-color, var(--error-color, #db4437));
    --l2m-weight: var(--leva2mqtt-weight-color, #d9963f);
    --l2m-flow: var(--leva2mqtt-flow-color, #3fa97c);
    --l2m-muted: var(--secondary-text-color, #727272);
    --l2m-track: var(--leva2mqtt-track-color, rgba(127, 127, 127, 0.18));
    --l2m-surface: var(--leva2mqtt-surface-color, rgba(127, 127, 127, 0.08));
  }
  ha-card {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .title {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-size: 18px;
    font-weight: 500;
  }
  .sub,
  .k {
    font-size: 12px;
    color: var(--l2m-muted);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 12px;
    border-radius: 15px;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 16%, transparent);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 4px;
    background: var(--c);
  }
  .live .dot {
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .live .dot {
      animation: none;
    }
  }
  .alert {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 500;
    color: var(--l2m-heat);
    background: color-mix(in srgb, var(--l2m-heat) 14%, transparent);
  }
  .hero {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .ring {
    position: relative;
    width: 220px;
    height: 220px;
    flex: none;
  }
  .ring svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 2px;
  }
  .center .top {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--l2m-muted);
  }
  .center .big {
    font-size: 52px;
    line-height: 1;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .center .big small {
    font-size: 20px;
    font-weight: 500;
    color: var(--l2m-muted);
    margin-left: 2px;
  }
  .center .bottom {
    font-size: 13px;
    color: var(--l2m-muted);
  }
  .side {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .stat .v {
    font-size: 22px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--c, var(--primary-text-color));
  }
  .stat .v small {
    font-size: 12px;
    font-weight: 500;
    color: var(--l2m-muted);
    margin-left: 2px;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: var(--l2m-track);
    overflow: hidden;
  }
  .bar div {
    height: 100%;
    border-radius: 2px;
    background: var(--c, var(--primary-text-color));
  }
  .chart {
    background: var(--l2m-surface);
    border-radius: 14px;
    padding: 12px 12px 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .chart .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
  }
  .chart svg {
    width: 100%;
    display: block;
  }
  .ax {
    font-size: 9px;
    fill: var(--l2m-muted);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    font-size: 11px;
    color: var(--l2m-muted);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .legend i {
    display: inline-block;
    width: 12px;
    height: 3px;
    border-radius: 2px;
    background: var(--c);
  }
  .legend a {
    margin-left: auto;
    color: var(--primary-color);
    font-weight: 500;
    text-decoration: none;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .rchip {
    appearance: none;
    border: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 12px;
    border-radius: 16px;
    background: var(--l2m-surface);
    color: var(--primary-text-color);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .rchip b {
    font-weight: 500;
    color: var(--l2m-muted);
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .act {
    appearance: none;
    border: none;
    flex: 1;
    height: 48px;
    border-radius: 14px;
    background: var(--l2m-surface);
    color: var(--primary-text-color);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    --mdc-icon-size: 20px;
  }
  .act.primary {
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
  }
  .act.armed {
    background: color-mix(in srgb, var(--l2m-steam) 22%, transparent);
    color: var(--l2m-steam);
  }
  button:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .compact {
    flex-direction: row;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
  }
  .compact .ring {
    width: 64px;
    height: 64px;
  }
  .compact .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .compact .line {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .compact .act {
    flex: none;
    width: 48px;
  }
  .msg {
    padding: 16px;
    color: var(--l2m-muted);
  }
  @container (max-width: 420px) {
    .hero {
      flex-direction: column;
    }
    .side {
      width: 100%;
    }
  }
`;
