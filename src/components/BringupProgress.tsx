/** BringupProgress (phase-09c, 05-ui §8.2): the hardware bring-up steps from
 * `telemetry.session.bringup`, listed while `telemetry.session.state` is
 * `bringup` — the Cockpit shows it above the stream grid until the session is
 * running; the Welcome Hardware tab shows the same list under the launchers
 * while its `POST /api/session` is pending (the telemetry socket is already
 * connected there, and the synchronous POST returns only after bring-up).
 * One row per (arm, step), Manipulation Arm first: a status glyph (pending →
 * 12 px spinner, ok → check, warning → amber glyph, error → red glyph), the
 * step name and the runtime's `detail` — e.g. `Perception Arm frozen at last
 * sample`. Renders nothing outside bring-up. Subscribes to a flat string
 * encoding of the rows so a 25 Hz telemetry tick re-renders it only when a
 * row actually changes (no data animation — rows appear, they do not move). */
import { useShallow } from "zustand/react/shallow";
import type { ArmBringupTelemetry } from "../gen";
import { armLabel, orderArms } from "../lib/streams";
import { useStore, type AppState } from "../store";
import { Icon, type IconName } from "./icons";

/** Step names the hardware workcell reports (04-runtime §5); unknown steps
 * render verbatim. */
export const STEP_LABELS: Readonly<Record<string, string>> = {
  network: "network",
  connect: "connect",
  rail: "rail",
  gripper: "gripper",
  report: "report stream",
  twin: "safety twin",
  frozen: "frozen",
  loop: "control loop",
  cameras: "cameras",
};

const SEP = ""; // unit separator: never in an arm id / step / detail
const encodeRow = (r: ArmBringupTelemetry): string =>
  [r.arm_id, r.step, r.status, r.detail ?? ""].join(SEP);
const decodeRow = (key: string): ArmBringupTelemetry => {
  const [arm_id = "", step = "", status = "pending", ...detail] = key.split(SEP);
  return {
    arm_id,
    step,
    status: status as ArmBringupTelemetry["status"],
    detail: detail.join(SEP),
  };
};

const selectBringupKeys = (s: AppState): string[] =>
  s.telemetry?.session?.state === "bringup"
    ? (s.telemetry.session.bringup ?? []).map(encodeRow)
    : [];
const selectBringingUp = (s: AppState): boolean => s.telemetry?.session?.state === "bringup";

const STATUS_ICON: Readonly<Record<ArmBringupTelemetry["status"], IconName | null>> = {
  pending: null,
  ok: "check",
  warning: "warning",
  error: "error",
};

export const BRINGUP_HEADLINE = "Bringing up the hardware session…";

export function BringupProgress() {
  const bringingUp = useStore(selectBringingUp);
  const keys = useStore(useShallow(selectBringupKeys));
  if (!bringingUp) return null;
  const rows = orderArms(keys.map(decodeRow), (r) => r.arm_id);
  return (
    <div className="panel bringup" role="status" aria-live="polite" data-testid="bringup-progress">
      <div className="bringup-head">
        <span className="spinner" aria-hidden="true" />
        <span className="text-body-strong">{BRINGUP_HEADLINE}</span>
      </div>
      {rows.length > 0 && (
        <ul className="bringup-rows">
          {rows.map((r) => {
            const icon = STATUS_ICON[r.status];
            return (
              <li
                key={`${r.arm_id}/${r.step}`}
                className="bringup-row"
                data-status={r.status}
                data-testid={`bringup-row-${r.arm_id}-${r.step}`}
              >
                <span className="bringup-glyph" aria-hidden="true">
                  {icon ? <Icon name={icon} size={14} /> : <span className="spinner" />}
                </span>
                <span className="bringup-arm">{armLabel(r.arm_id)}</span>
                <span className="bringup-step text-mono">{STEP_LABELS[r.step] ?? r.step}</span>
                <span className="bringup-status">{r.status}</span>
                {r.detail && <span className="bringup-detail fg-2">{r.detail}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
