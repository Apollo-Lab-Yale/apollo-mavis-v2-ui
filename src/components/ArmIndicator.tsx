/** Active-arm indicator + per-arm chips (05-ui §8.2). Arms are listed
 * Manipulation Arm first (`orderArms`); each row shows the display name from
 * `ARM_LABELS` with the runtime id in a dim mono chip beside it. A controller
 * error is the same red `C<code>` chip as the Welcome arm card (phase-09b),
 * titled with the runtime's `fault_detail` (SDK title) — recovery is the
 * operator's click on the Cockpit `FaultBanner`, never automatic. */
import type { ArmTelemetry } from "../gen";
import { armLabel, orderArms } from "../lib/streams";

export interface ArmIndicatorProps {
  arms: ArmTelemetry[];
  activeArm: string | null;
}

export function ArmIndicator({ arms, activeArm }: ArmIndicatorProps) {
  return (
    <div className="panel" data-testid="arm-indicator">
      <div className="dim">
        Active arm <kbd>Tab</kbd> to switch
      </div>
      {orderArms(arms, (a) => a.arm_id).map((a) => {
        const active = a.arm_id === activeArm;
        return (
          <div className="kv" key={a.arm_id} data-testid={`arm-chip-${a.arm_id}`}>
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
          </div>
        );
      })}
    </div>
  );
}
