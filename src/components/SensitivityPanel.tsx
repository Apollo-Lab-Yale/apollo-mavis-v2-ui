/** Cockpit collision-sensitivity control (05-ui §8.2, 2026-09-11, operator
 * decision): rendered under the `ArmIndicator` for HARDWARE sessions only, one
 * row per telemetry arm — the arm's name and a 1 / 2 / 3 `<select>` posting the
 * same `set_collision_sensitivity` maintenance op the Welcome arm card posts
 * (`POST /api/hardware/arms/{arm_id}/maintenance {op, collision_sensitivity}`);
 * the runtime routes it to the SESSION driver, which issues the one SDK write
 * on its monitor thread. The value shown is server-authoritative and never
 * optimistic: the monitor row's read-back (`hardware_monitor.arms[].
 * collision_sensitivity` — the runtime keeps it meaningful while the monitor is
 * paused) when present, else the additive `ArmTelemetry.collision_sensitivity`
 * the runtime reports in-session (optional on the wire — an older runtime omits
 * it), else a disabled "—" placeholder. The override is volatile — the config
 * value returns at the next connect — which the hint line repeats. Disabled
 * with the control link down, for observers, and while a POST is in flight. */
import { useState } from "react";
import { postArmMaintenance } from "../api/rest";
import type { ArmTelemetry, HardwareMonitorTelemetry } from "../gen";
import {
  isSensitivityLevel,
  maintenanceErrorText,
  maintenanceToast,
  SENSITIVITY_HINT,
  SENSITIVITY_LEVELS,
  type SensitivityLevel,
} from "../lib/maintenance";
import { armLabel, orderArms } from "../lib/streams";
import { useStore } from "../store";

export interface SensitivityPanelProps {
  arms: ArmTelemetry[];
  monitor: HardwareMonitorTelemetry | null | undefined;
  /** Control link down or observer role: every select disabled. */
  disabled: boolean;
}

/** The level the Cockpit shows for one arm (pure): the monitor row's read-back
 * when the block carries one, else the runtime's in-session `ArmTelemetry.
 * collision_sensitivity` (additive; absent on an older runtime), else null. */
export function sessionSensitivity(
  arm: ArmTelemetry,
  monitor: HardwareMonitorTelemetry | null | undefined,
): number | null {
  const row = monitor?.arms?.find((a) => a.arm_id === arm.arm_id);
  if (row?.collision_sensitivity != null) return row.collision_sensitivity;
  return typeof arm.collision_sensitivity === "number" ? arm.collision_sensitivity : null;
}

export function SensitivityPanel({ arms, monitor, disabled }: SensitivityPanelProps) {
  const addToast = useStore((s) => s.addToast);
  // arm_id of the POST in flight (one at a time across the panel: the runtime
  // serialises maintenance per arm and the operator changes one level at a time)
  const [pending, setPending] = useState<string | null>(null);
  const run = async (armId: string, level: SensitivityLevel) => {
    if (pending !== null) return;
    setPending(armId);
    try {
      const { text, tone } = maintenanceToast(
        await postArmMaintenance(armId, "set_collision_sensitivity", {
          collisionSensitivity: level,
        }),
      );
      addToast(text, tone);
    } catch (e) {
      addToast(maintenanceErrorText(armId, e), "error");
    } finally {
      setPending(null);
    }
  };
  return (
    <div
      className="panel sensitivity-panel"
      role="group"
      aria-label="Collision sensitivity"
      data-testid="sensitivity-panel"
    >
      <span className="text-body-strong">Collision sensitivity</span>
      {orderArms(arms, (a) => a.arm_id).map((arm) => {
        const value = sessionSensitivity(arm, monitor);
        const known = isSensitivityLevel(value);
        const busy = pending === arm.arm_id;
        return (
          <label
            key={arm.arm_id}
            className="sensitivity-row"
            data-testid={`cockpit-sensitivity-row-${arm.arm_id}`}
          >
            <span className="sensitivity-arm">{armLabel(arm.arm_id)}</span>
            <select
              data-testid={`cockpit-sensitivity-${arm.arm_id}`}
              aria-label={`Collision sensitivity · ${armLabel(arm.arm_id)}`}
              aria-busy={busy ? "true" : undefined}
              data-readback={value ?? "none"}
              value={known ? String(value) : ""}
              disabled={disabled || !known || pending !== null}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (isSensitivityLevel(n) && n !== value) void run(arm.arm_id, n);
              }}
            >
              {!known && (
                <option value="" disabled>
                  {value == null ? "—" : String(value)}
                </option>
              )}
              {SENSITIVITY_LEVELS.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
            {busy && <span className="spinner" aria-hidden="true" />}
          </label>
        );
      })}
      <span className="text-caption fg-3 sensitivity-hint" data-testid="sensitivity-hint">
        {SENSITIVITY_HINT}
      </span>
    </div>
  );
}
