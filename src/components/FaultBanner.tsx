/** Cockpit fault banner (05-ui §8.2, phase-09b). Shown while any arm carries a
 * `fault_detail` / `recovering` flag or the session state is `fault` /
 * `recovering`: one row per faulted arm — display name + `C<code> <title>`
 * (the SDK `x_code` title the runtime put in `fault_detail`) — red while the
 * fault stands, amber once every row is recovering. Hardware sessions get a
 * **Clear errors & resume** button per row: `POST …/maintenance {op:
 * "recover"}` (the driver's user-initiated recovery — clear, enable, servo
 * mode, re-seed from the measured pose; no motion), busy while the request
 * is in flight or the arm reports `recovering`, and a success toast that
 * tells the operator to re-grip the clutch (the control loop stays in
 * `recovering` until the held set is empty and the clutch is re-taken). Sim
 * faults, if any, are display-only. A lingering `StudioConflictWarning`
 * (`fault_detail` = `warning: …`, `error_code` 0, not recovering — the arm was
 * NOT stopped) is an amber display-only `WARNING` row without a button and
 * does not count toward the red/amber decision. Renders null when nothing is
 * wrong. */
import { useState } from "react";
import { postArmMaintenance } from "../api/rest";
import type { ArmTelemetry } from "../gen";
import {
  faultLabel,
  isWarningDetail,
  maintenanceErrorText,
  maintenanceToast,
  REGRIP_HINT,
  warningText,
} from "../lib/maintenance";
import { armLabel, orderArms } from "../lib/streams";
import { useStore } from "../store";

export interface FaultBannerProps {
  arms: ArmTelemetry[];
  /** `telemetry.session.state` (live) with `SessionInfo.state` as the fallback. */
  sessionState: string | null | undefined;
  /** A hardware session owns the boxes → the recover button; sim = display only. */
  hardware: boolean;
  stale?: boolean;
}

export const RECOVER_LABEL = "Clear errors & resume";

/** Arms the banner lists: a non-empty `fault_detail` or `recovering`, Manipulation Arm first. */
export const faultedArms = (arms: readonly ArmTelemetry[]): ArmTelemetry[] =>
  orderArms(
    arms.filter((a) => (a.fault_detail ?? "") !== "" || a.recovering === true),
    (a) => a.arm_id,
  );

/** `sessionState` alone (no arm row) also raises the banner. */
export const sessionFaulted = (state: string | null | undefined): boolean =>
  state === "fault" || state === "recovering";

/** A display-only warning row (the runtime's 5 s `StudioConflictWarning`):
 * the arm keeps running, so no fault header, no C-code, no recover button. */
export const isWarningRow = (a: ArmTelemetry): boolean =>
  a.recovering !== true && (a.error_code ?? 0) === 0 && isWarningDetail(a.fault_detail);

export function FaultBanner({ arms, sessionState, hardware, stale = false }: FaultBannerProps) {
  const addToast = useStore((s) => s.addToast);
  const [pending, setPending] = useState<string | null>(null);
  const rows = faultedArms(arms);
  if (rows.length === 0 && !sessionFaulted(sessionState)) return null;

  // Only real fault rows decide red vs amber; warning rows never make it red.
  const faults = rows.filter((a) => !isWarningRow(a));
  const red =
    faults.length > 0 ? faults.some((a) => a.recovering !== true) : sessionState === "fault";
  const state = red
    ? "fault"
    : faults.length > 0 || sessionState === "recovering"
      ? "recovering"
      : "warning";
  const recover = async (armId: string) => {
    if (pending !== null) return;
    setPending(armId);
    try {
      const { text, tone } = maintenanceToast(await postArmMaintenance(armId, "recover"));
      addToast(text, tone);
    } catch (e) {
      addToast(maintenanceErrorText(armId, e), "error");
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      className={`banner banner-fault ${red ? "banner-red" : "banner-amber"}`}
      data-testid="fault-banner"
      data-state={state}
      role="alert"
    >
      {rows.map((a) => {
        if (isWarningRow(a)) {
          return (
            <div
              className="banner-fault-row"
              key={a.arm_id}
              data-testid={`fault-row-${a.arm_id}`}
              data-kind="warning"
            >
              <span>
                WARNING — {armLabel(a.arm_id)} {warningText(a.fault_detail ?? "")}
                {stale && " (stale)"}
              </span>
            </div>
          );
        }
        const recovering = a.recovering === true;
        const busy = recovering || pending === a.arm_id;
        return (
          <div className="banner-fault-row" key={a.arm_id} data-testid={`fault-row-${a.arm_id}`}>
            <span>
              {recovering ? "RECOVERING" : "CONTROLLER FAULT"} — {armLabel(a.arm_id)}{" "}
              {faultLabel(a.error_code, a.fault_detail ?? "")}
              {recovering && ` · ${REGRIP_HINT}`}
              {stale && " (stale)"}
            </span>
            {hardware && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={busy || pending !== null}
                aria-busy={busy ? "true" : undefined}
                data-testid={`fault-recover-${a.arm_id}`}
                onClick={() => void recover(a.arm_id)}
              >
                {busy && <span className="spinner" aria-hidden="true" />}
                {RECOVER_LABEL}
              </button>
            )}
          </div>
        );
      })}
      {faults.length === 0 && sessionFaulted(sessionState) && (
        <div className="banner-fault-row" data-testid="fault-row-session">
          <span>
            {sessionState === "recovering"
              ? `RECOVERING — ${REGRIP_HINT}`
              : "CONTROLLER FAULT — session halted"}
            {stale && " (stale)"}
          </span>
        </div>
      )}
    </div>
  );
}
