/** Pure helpers for the phase-09b maintenance UI (05-ui §8.1 / §8.2): the
 * Hardware-tab arm-card read-back line + button enablement, the toast copy
 * for an `ArmMaintenanceResult`, and the `C<code> <title>` fault label shared
 * by the arm cards, the Cockpit `ArmIndicator` chip and the `FaultBanner`.
 * Nothing here touches the store or the network. */
import type {
  ArmMaintenanceRequest,
  ArmMaintenanceResult,
  ArmMonitorTelemetry,
  ArmStatusInfo,
} from "../gen";
import type { ToastTone } from "../store";
import { armLabel } from "./streams";

export type MaintenanceOp = ArmMaintenanceRequest["op"];

/** Visible reason under the disabled card buttons while a hardware session
 * owns the control boxes (the runtime routes `clear_errors` to the session
 * driver and answers `apply_backstops` with 409 — use the Cockpit banner). */
export const REASON_USE_COCKPIT = "Use the Cockpit";
/** Title of the amber read-back line when `backstops_match === false`. */
export const TITLE_DIFFERS = "differs from config";
/** What the operator must do after a successful `recover`. */
export const REGRIP_HINT = "re-grip the clutch to continue";

/** `0.95` → `"0.95 kg"` (two decimals, tabular in the CSS). */
export const formatKg = (kg: number): string => `${kg.toFixed(2)} kg`;

/** Split the runtime's fault text — `"controller error 24: Speed Exceeds
 * Limit"` (the SDK `x_code` title) — into code + title. Free text that does
 * not follow the pattern keeps `code: null` and is returned whole as `title`. */
export function parseFaultDetail(detail: string): { code: number | null; title: string } {
  const m = /^controller error (\d+)(?::\s*(.*))?$/i.exec(detail.trim());
  if (!m) return { code: null, title: detail.trim() };
  return { code: Number(m[1]), title: (m[2] ?? "").trim() };
}

/** `"C24 Speed Exceeds Limit"` from the controller code and (optional)
 * detail; `"C19"` when there is no title. Never emits `C0`: during
 * RECOVERING the driver has already cleared the controller error
 * (`error_code` 0) while the loop keeps the `fault_detail` text, so the code
 * named IN the detail wins; a code-less driver text (`"recovery budget
 * exhausted (3 in 30 s)"`) with `error_code` 0 is returned verbatim, no chip.
 * A detail whose own (non-zero) code disagrees with a non-zero `code` is
 * appended verbatim so nothing is hidden. */
export function faultLabel(code: number, detail = ""): string {
  const parsed = parseFaultDetail(detail);
  if (parsed.code !== null && (code === 0 || parsed.code === code)) {
    return parsed.title ? `C${parsed.code} ${parsed.title}` : `C${parsed.code}`;
  }
  if (parsed.code === null) {
    if (code === 0) return parsed.title;
    return parsed.title ? `C${code} ${parsed.title}` : `C${code}`;
  }
  return `C${code} ${detail.trim()}`;
}

/** The runtime's lingering `StudioConflictWarning` (04-runtime §15): for 5 s
 * `fault_detail` reads `"warning: close UFACTORY Studio live control"` with
 * `error_code` 0, `recovering` false and the session still `running` — the
 * arm was NOT stopped, so the banner shows it display-only (no C-code, no
 * recover button; a click would needlessly halt a healthy arm). */
const WARNING_PREFIX = /^warning:\s*/i;
export const isWarningDetail = (detail: string | null | undefined): boolean =>
  WARNING_PREFIX.test((detail ?? "").trim());
/** `"warning: close UFACTORY Studio live control"` → `"close UFACTORY Studio live control"`. */
export const warningText = (detail: string): string => detail.trim().replace(WARNING_PREFIX, "");

/** Everything the Hardware-tab arm card derives for its maintenance strip.
 * Primitives only, so a `useShallow` store selector re-renders the card only
 * when something here actually changes (the monitor block is a fresh object
 * on every 25 Hz telemetry tick). */
export interface MaintenanceView {
  /** `"sensitivity 3 · payload 0.95 kg"`; null while neither value was read back. */
  meta: string | null;
  /** Controller values differ from the arm's `ArmConfig` (`backstops_match === false`). */
  mismatch: boolean;
  /** `error_code != 0 || warn_code != 0` (monitor row; `ArmStatusInfo.error_code` fallback). */
  hasErrors: boolean;
  /** A maintenance op is executing on this arm (`maintenance_busy`). */
  busy: boolean;
  /** A hardware session owns the boxes (`hardware_monitor.paused`). */
  sessionActive: boolean;
  clearEnabled: boolean;
  applyEnabled: boolean;
  /** Visible text beside the buttons when they are disabled for a reason the
   * card itself does not show (only `REASON_USE_COCKPIT` today). */
  reason: string | null;
}

export function maintenanceView(
  monitor: ArmMonitorTelemetry | null | undefined,
  arm: Pick<ArmStatusInfo, "error_code">,
  sessionActive: boolean,
): MaintenanceView {
  const errorCode = monitor?.error_code ?? arm.error_code;
  const warnCode = monitor?.warn_code ?? 0;
  const hasErrors = errorCode !== 0 || warnCode !== 0;
  const busy = monitor?.maintenance_busy === true;
  const mismatch = monitor?.backstops_match === false;
  const parts: string[] = [];
  if (monitor?.collision_sensitivity != null)
    parts.push(`sensitivity ${monitor.collision_sensitivity}`);
  if (monitor?.tcp_load_kg != null) parts.push(`payload ${formatKg(monitor.tcp_load_kg)}`);
  return {
    meta: parts.length > 0 ? parts.join(" · ") : null,
    mismatch,
    hasErrors,
    busy,
    sessionActive,
    clearEnabled: hasErrors && !sessionActive && !busy,
    applyEnabled: mismatch && !sessionActive && !busy,
    reason: sessionActive ? REASON_USE_COCKPIT : null,
  };
}

/** The values `apply_backstops` WROTE, parsed from the runtime's detail
 * (`"safety settings applied: sensitivity 3, payload 0.95 kg at (0, 0, 60) mm
 * …"`); null when the detail does not carry them. */
const WRITTEN_BACKSTOPS = /sensitivity (\d+), payload (\d+(?:\.\d+)?) kg/;
/** The monitor's note when the rich report frame had not echoed the new
 * values within its 0.5 s settle window: `"(read-back not yet reflected: …)"`. */
const READBACK_LAG = /\((read-back[^)]*)\)/;

/** Toast for a 200 `ArmMaintenanceResult` (the runtime answers 200 whether or
 * not `ok`): `Manipulation Arm · errors cleared`, `Manipulation Arm · safety
 * settings applied (sensitivity 3, payload 0.95 kg)` — the parenthesis names
 * the values WRITTEN (from the runtime `detail`; the `after` read-back is the
 * fallback, omitted when neither exists); when the controller has not echoed
 * them yet (`after.backstops_match === false`) or non-fatal `warnings` came
 * back, the tone is amber and the note / warnings are appended —
 * `Manipulation Arm · re-grip the clutch to continue`; `ok: false` → error
 * tone with the runtime's `detail`. */
export function maintenanceToast(result: ArmMaintenanceResult): { text: string; tone: ToastTone } {
  const label = armLabel(result.arm_id);
  if (!result.ok) {
    return { text: `${label} · ${result.detail || `${result.op} failed`}`, tone: "error" };
  }
  switch (result.op) {
    case "clear_errors":
      return { text: `${label} · errors cleared`, tone: "success" };
    case "apply_backstops": {
      const after = result.after ?? null;
      const written = WRITTEN_BACKSTOPS.exec(result.detail ?? "");
      const values: string[] = [];
      if (written?.[1] != null && written[2] != null) {
        values.push(`sensitivity ${written[1]}`, `payload ${formatKg(Number(written[2]))}`);
      } else {
        if (after?.collision_sensitivity != null)
          values.push(`sensitivity ${after.collision_sensitivity}`);
        if (after?.tcp_load_kg != null) values.push(`payload ${formatKg(after.tcp_load_kg)}`);
      }
      let text = `${label} · safety settings applied`;
      if (values.length > 0) text += ` (${values.join(", ")})`;
      const notes: string[] = [];
      if (after?.backstops_match === false) {
        const lag = READBACK_LAG.exec(result.detail ?? "");
        notes.push(lag?.[1] ?? "read-back still differs from config");
      }
      notes.push(...(result.warnings ?? []));
      if (notes.length > 0) return { text: `${text} — ${notes.join("; ")}`, tone: "warning" };
      return { text, tone: "success" };
    }
    case "recover":
      return { text: `${label} · ${REGRIP_HINT}`, tone: "success" };
  }
}

/** Toast text for a rejected request (`ApiError` 404 / 409 / network). */
export const maintenanceErrorText = (armId: string, e: unknown): string =>
  `${armLabel(armId)} · ${
    e instanceof Error && "detail" in e && typeof e.detail === "string"
      ? e.detail
      : e instanceof Error
        ? e.message
        : String(e)
  }`;
