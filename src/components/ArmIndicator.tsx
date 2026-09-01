/** Active-arm indicator + per-arm chips (05-ui §8.2). */
import type { ArmTelemetry } from "../gen";

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
      {arms.map((a) => {
        const active = a.arm_id === activeArm;
        return (
          <div className="kv" key={a.arm_id} data-testid={`arm-chip-${a.arm_id}`}>
            <span>
              <span
                className={`chip ${!a.connected ? "chip-red" : active ? "chip-green" : "chip-grey"}`}
              >
                {a.arm_id}
              </span>{" "}
              {!a.connected ? "DISCONNECTED — motion held" : active ? "active" : "holding"}
              {a.error_code !== 0 && (
                <span
                  className="chip chip-amber"
                  title="runtime auto-recovers: clean_error → motion_enable → set_mode → set_state → re-seed"
                >
                  err {a.error_code}
                </span>
              )}
            </span>
            <span className="mono dim">
              {a.rail_pos_m != null && `rail ${a.rail_pos_m.toFixed(3)} m · `}
              grip {(a.gripper_open_frac * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
