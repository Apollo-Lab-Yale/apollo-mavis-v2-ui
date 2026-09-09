/** Active-arm indicator + per-arm chips (05-ui §8.2). Arms are listed
 * Manipulation Arm first (`orderArms`); each row shows the display name from
 * `ARM_LABELS` with the runtime id in a dim mono chip beside it. A controller
 * error is the same red `C<code>` chip as the Welcome arm card (phase-09b),
 * titled with the runtime's `fault_detail` (SDK title) — recovery is the
 * operator's click on the Cockpit `FaultBanner`, never automatic.
 *
 * EVERY ROW IS A BUTTON (2026-09-07, operator's request): clicking one switches
 * the active arm, so arm switching no longer needs the Vive controller (whose
 * `menu_click` was the only mouse-free path) or an armed capture surface for
 * Tab — which the Joint-control panel steals focus from by construction. The
 * switch stays SERVER-AUTHORITATIVE: the click sends `switch_arm {arm_id}` and
 * the row highlights only when the next telemetry says so, never optimistically
 * (a refused switch must not show a lie). Clicking the active row is a no-op
 * that the runtime accepts without releasing the tracker anchors. */
import type { ArmTelemetry } from "../gen";
import { armLabel, orderArms } from "../lib/streams";

export interface ArmIndicatorProps {
  arms: ArmTelemetry[];
  activeArm: string | null;
  /** Omitted → rows render as plain, non-interactive rows (no session writer). */
  onSelect?(armId: string): void;
  /** Observer role / control link down / recording: rows stay visible, inert. */
  disabled?: boolean;
  /** Keycap of whatever the served keymap binds to `switch_arm` ("Tab"); the hint
   * is omitted when nothing is bound, so it can never advertise a dead key. */
  shortcut?: string | null;
}

export function ArmIndicator({
  arms,
  activeArm,
  onSelect,
  disabled = false,
  shortcut = null,
}: ArmIndicatorProps) {
  const clickable = onSelect !== undefined && !disabled;
  return (
    <div className="panel" data-testid="arm-indicator">
      <div className="dim">
        Active arm
        {clickable && (
          <>
            {" — click a row"}
            {shortcut && (
              <>
                {" or press "}
                <kbd>{shortcut}</kbd>
              </>
            )}
          </>
        )}
      </div>
      {orderArms(arms, (a) => a.arm_id).map((a) => {
        const active = a.arm_id === activeArm;
        return (
          <button
            type="button"
            className="kv arm-row"
            key={a.arm_id}
            data-testid={`arm-chip-${a.arm_id}`}
            aria-pressed={active}
            disabled={!clickable}
            title={active ? `${armLabel(a.arm_id)} is active` : `Switch to ${armLabel(a.arm_id)}`}
            onClick={() => onSelect?.(a.arm_id)}
          >
            <span>
              <span
                className={`chip ${!a.connected ? "chip-red" : active ? "chip-green" : "chip-grey"}`}
              >
                {armLabel(a.arm_id)}
              </span>{" "}
              <span className="chip chip-id" data-testid={`arm-id-${a.arm_id}`}>
                {a.arm_id}
              </span>{" "}
              {!a.connected ? "DISCONNECTED — motion held" : active ? "active" : "holding"}
              {a.error_code !== 0 && (
                <span
                  className="chip chip-red"
                  data-testid={`arm-error-${a.arm_id}`}
                  title={a.fault_detail || `controller error ${a.error_code}`}
                >
                  C{a.error_code}
                </span>
              )}
            </span>
            <span className="mono dim">
              {a.rail_pos_m != null && `rail ${a.rail_pos_m.toFixed(3)} m · `}
              gripper {(a.gripper_open_frac * 100).toFixed(0)}%
            </span>
          </button>
        );
      })}
    </div>
  );
}
