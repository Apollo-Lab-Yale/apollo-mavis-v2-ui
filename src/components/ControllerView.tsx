/** Vive-controller sub-panel of the tracker panel (13-tracker §1.1).
 *
 * Fed from `telemetry.tracker.controller` (raw button/axis state echoed by the
 * runtime), `telemetry.tracker.device_held` (the key codes the runtime injects
 * from it — trigger → clutch, trackpad left/right → gripper rate) and
 * `telemetry.tracker.device_action` (the last device-sourced discrete action —
 * trackpad up/down → switch_arm / switch_arm_prev — which the runtime clears
 * ~1 s after it fired, so it renders as a flash chip). Codes are mapped back to
 * actions/labels through the served keymap; the controller glyph per action
 * comes from the static `CONTROLLER_GLYPHS` table (the keymap has no
 * controller field).
 */
import type { ControllerTelemetry } from "../gen";
import { CONTROLLER_GLYPHS, keycapLabel, type Bindings } from "../input/bindings";

export interface ControllerViewProps {
  controller: ControllerTelemetry | null | undefined;
  deviceHeld: readonly string[];
  /** `telemetry.tracker.device_action` — null/undefined when nothing recent. */
  deviceAction?: string | null;
  bindings: Bindings | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

function Chip({
  id,
  on,
  label,
  title,
}: {
  id: string;
  on: boolean;
  label: string;
  title?: string;
}) {
  return (
    <span
      className={`chip ${on ? "chip-green" : "chip-grey"}`}
      data-testid={id}
      data-lit={on}
      title={title}
    >
      {label}
    </span>
  );
}

/** One chip per controller-mapped action — held rows lit while their code is
 * in `device_held`, discrete rows lit while `device_action` names them — plus
 * any unexpected injected code. */
function HeldCodes({
  deviceHeld,
  deviceAction,
  bindings,
}: {
  deviceHeld: readonly string[];
  deviceAction: string | null;
  bindings: Bindings | null;
}) {
  const mapped = new Set<string>();
  const chips = Object.entries(CONTROLLER_GLYPHS).map(([action, glyph]) => {
    const row = bindings?.entries.find((e) => e.action === action) ?? null;
    if (row) mapped.add(row.code);
    const lit =
      row?.kind === "discrete"
        ? deviceAction === action
        : row !== null && deviceHeld.includes(row.code);
    return (
      <Chip
        key={action}
        id={`controller-held-${action}`}
        on={lit}
        label={`${glyph} → ${action}${row ? ` (${keycapLabel(row.code)})` : ""}`}
        title={row ? `${row.code} · ${row.label}` : "not in keymap"}
      />
    );
  });
  const extras = deviceHeld
    .filter((code) => !mapped.has(code))
    .map((code) => {
      const row = bindings?.entries.find((e) => e.code === code) ?? null;
      return (
        <Chip
          key={code}
          id={`controller-held-${code}`}
          on
          label={row ? `${row.action} (${keycapLabel(code)})` : code}
          title={row?.label ?? "code not in keymap"}
        />
      );
    });
  return (
    <div className="mapped-row" data-testid="controller-held">
      {chips}
      {extras}
    </div>
  );
}

export function ControllerView({
  controller,
  deviceHeld,
  deviceAction = null,
  bindings,
}: ControllerViewProps) {
  if (!controller) {
    return (
      <div className="controller" data-testid="controller-view">
        <div className="kv">
          <strong>Controller</strong>
          <span className="chip chip-grey" data-testid="controller-status">
            controller: none
          </span>
        </div>
      </div>
    );
  }
  const trigger = clamp(controller.trigger ?? 0, 0, 1);
  const x = clamp(controller.trackpad_x ?? 0, -1, 1);
  const y = clamp(controller.trackpad_y ?? 0, -1, 1); // +y = top of the pad
  const touch = controller.trackpad_touch ?? false;
  const click = controller.trackpad_click ?? false;
  const dotTone = click
    ? " trackpad-dot-click"
    : touch
      ? " trackpad-dot-touch"
      : " trackpad-dot-idle";
  return (
    <div className="controller" data-testid="controller-view">
      <div className="kv">
        <strong>Controller</strong>
        <span className="chip chip-green" data-testid="controller-status">
          controller: live
        </span>
      </div>
      <div className="kv">
        <span className="dim" style={{ fontSize: 12 }}>
          injected codes (device_held) · last discrete action (device_action)
        </span>
        <span
          key={deviceAction ?? "none"}
          className={`chip ${deviceAction ? "chip-amber chip-flash" : "chip-grey"}`}
          data-testid="controller-device-action"
          data-lit={deviceAction !== null}
          title="device-sourced discrete action, cleared by the runtime ~1 s after it fired"
        >
          {deviceAction ?? "no recent action"}
        </span>
      </div>
      <HeldCodes deviceHeld={deviceHeld} deviceAction={deviceAction} bindings={bindings} />
      <div className="ctrl-row">
        <span className="dim ctrl-label">trigger</span>
        <span
          className="analog"
          role="progressbar"
          aria-label="trigger"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={trigger}
          data-testid="controller-trigger-bar"
        >
          <span
            className="analog-fill"
            style={{ width: pct(trigger) }}
            data-testid="controller-trigger-fill"
          />
        </span>
        <span className="mono" data-testid="controller-trigger-value">
          {trigger.toFixed(2)}
        </span>
        <Chip
          id="controller-trigger-pressed"
          on={!!controller.trigger_pressed}
          label="pressed"
          title="trigger click (button 0)"
        />
      </div>
      <div className="ctrl-row">
        <span className="dim ctrl-label">trackpad</span>
        <div className="trackpad" data-testid="controller-trackpad">
          <span className="trackpad-hint trackpad-hint-top" title="switch_arm">
            ▲
          </span>
          <span className="trackpad-hint trackpad-hint-bottom" title="switch_arm_prev">
            ▼
          </span>
          <span className="trackpad-hint trackpad-hint-left" title="gripper_close">
            ◀
          </span>
          <span className="trackpad-hint trackpad-hint-right" title="gripper_open">
            ▶
          </span>
          <span
            className={`trackpad-dot${dotTone}`}
            style={{ left: pct((x + 1) / 2), top: pct((1 - y) / 2) }}
            data-testid="controller-pad-dot"
          />
        </div>
        <div className="ctrl-stack">
          <span className="mono dim" style={{ fontSize: 12 }} data-testid="controller-pad-xy">
            x {signed(x)} · y {signed(y)}
          </span>
          <span>
            <Chip id="controller-pad-touch" on={touch} label="touch" title="finger on the pad" />{" "}
            <Chip
              id="controller-pad-click"
              on={click}
              label="click"
              title="pad pressed (button 1)"
            />
          </span>
        </div>
      </div>
      <div className="ctrl-row">
        <span className="dim ctrl-label">buttons</span>
        <Chip id="controller-grip" on={!!controller.grip} label="grip" title="button 7" />
        <Chip id="controller-menu" on={!!controller.menu} label="menu" title="button 6" />
        <Chip id="controller-system" on={!!controller.system} label="system" title="button 3" />
        <span className="dim" style={{ fontSize: 11 }}>
          menu + system = pairing combo (never mapped)
        </span>
      </div>
    </div>
  );
}
