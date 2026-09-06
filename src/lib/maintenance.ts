/** Pure helpers for the phase-09b/09c/09d maintenance UI (05-ui §8.1 / §8.2):
 * the Hardware-tab arm-card read-back line + button enablement (Clear errors /
 * Apply safety settings / Home rail), the rail read-back, the per-arm session
 * eligibility (every hardware arm joins the session since phase-09d, so the
 * gate only explains why Teleop is blocked), the `RailSweepVerdict` and
 * `PrePositionPlan` copy of the `HomeRailSheet`, the `RailHomingJob` phase
 * vocabulary, the toast copy for an `ArmMaintenanceResult`, and the `C<code>
 * <title>` fault label shared by the arm cards, the Cockpit `ArmIndicator`
 * chip and the `FaultBanner`. Nothing here touches the store or the network. */
import type {
  ArmMaintenanceRequest,
  ArmMaintenanceResult,
  ArmMonitorTelemetry,
  ArmStatusInfo,
  MaintenanceProgress,
  PrePositionPlan,
  RailSweepVerdict,
} from "../gen";
import type { ToastTone } from "../store";
import { armLabel } from "./streams";

export type MaintenanceOp = ArmMaintenanceRequest["op"];

/** Visible reason under the disabled card buttons while a hardware session
 * owns the control boxes (the runtime routes `clear_errors` to the session
 * driver and answers `apply_backstops` with 409 — use the Cockpit banner). */
export const REASON_USE_COCKPIT = "Use the Cockpit";
/** Visible reason under the disabled card buttons while a `RailHomingJob` (or
 * the synchronous 09c homing) runs on SOME hardware arm: the runtime answers
 * every other maintenance op and `POST /api/session` 409 "rail homing in
 * progress" meanwhile. There is no session and no Cockpit to use — the
 * monitor's `paused` flag is set because the JOB's driver owns a box. */
export const REASON_HOMING_IN_PROGRESS = "Rail homing in progress — wait for it to finish";
/** Visible reason under a disabled **Home rail** while the controller reports
 * an error (the runtime refuses to home with `error_code != 0`). */
export const REASON_CLEAR_FIRST = "Clear errors first";
/** Title of the amber read-back line when `backstops_match === false`. */
export const TITLE_DIFFERS = "differs from config";
/** What the operator must do after a successful `recover`. */
export const REGRIP_HINT = "re-grip the clutch to continue";
/** The one sentence every homing surface repeats (phase-09c rule 1): homing IS
 * motion, and this is where the carriage goes. The homing travel runs at the
 * track's OWN homing speed (its register has no public SDK setter; duration
 * unmeasured, 02-hardware §8.6) — 50 mm/s is the hardware `rail_speed_mm_s`
 * POSITIONING cap at scale 1.0 (D2), written after homing for later moves. */
export const HOME_RAIL_NOTICE =
  "The carriage drives to the operator's LEFT (+X) end at the track's homing speed (positioning cap 50 mm/s) — the only maintenance action that moves hardware.";
/** Arm-card pill while the track is present but not (homed AND enabled). */
export const RAIL_NOT_HOMED = "rail not homed";
/** Cockpit hint for a hardware arm the session did not include (phase-09c D1):
 * posed once in the gate twin from its last monitor sample and frozen there —
 * brakes on, not enabled, so it cannot move by itself; moving it from xArm
 * Studio would silently invalidate the gate (not detected in this phase).
 * Since phase-09d every configured arm joins a hardware session, so D1 only
 * applies to the maintenance motion of a `RailHomingJob` (no session) and the
 * hint is a defensive path for an older runtime. */
export const frozenHint = (armId: string): string =>
  `${armLabel(armId)} frozen at last sample — do not move it from Studio`;

/** `0.95` → `"0.95 kg"` (two decimals, tabular in the CSS). */
export const formatKg = (kg: number): string => `${kg.toFixed(2)} kg`;
/** `0.12` → `"0.120 m"` (rail positions, three decimals). */
export const formatM = (m: number): string => `${m.toFixed(3)} m`;
/** `0.0321` → `"32 mm"` (clearances / inflation, whole millimetres). */
export const formatMm = (m: number): string => `${Math.round(m * 1000)} mm`;
/** `Math.PI` → `"180.0°"` (joint angles for the operator, one decimal; `-0.0`
 * never appears). */
export const formatDeg = (rad: number): string => {
  const deg = (rad * 180) / Math.PI;
  const text = (Math.abs(deg) < 0.05 ? 0 : deg).toFixed(1);
  return `${text}°`;
};
/** `["grip/link6", "table"]` → `"grip/link6 ↔ table"`. */
export const pairText = (pair: readonly string[]): string => pair.join(" ↔ ");

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

/** The monitor's rail read-back for one arm (phase-09c): `homed` = the track
 * reports on-zero AND enabled (position known → `rail_pos_m`); `unhomed` = a
 * track is present but the carriage position is unknown (the runtime refuses a
 * hardware session for this arm and the card offers **Home rail**); `none` =
 * the monitor saw no track; `unknown` = no monitor row yet (the card falls
 * back to `ArmStatusInfo.has_rail`). */
export type RailState = "homed" | "unhomed" | "none" | "unknown";

export const railState = (monitor: ArmMonitorTelemetry | null | undefined): RailState => {
  if (!monitor || monitor.rail_present == null) return "unknown";
  if (!monitor.rail_present) return "none";
  return monitor.rail_homed === true && monitor.rail_enabled === true ? "homed" : "unhomed";
};

/** Monitor row present and live enough to pose the twin (`running` / `stale`
 * keep their last sample; `off` / `connecting` / `paused` / `error` do not). */
export const monitorLive = (monitor: ArmMonitorTelemetry | null | undefined): boolean =>
  monitor?.status === "running" || monitor?.status === "stale";

/** Arm-card rail text: `rail 0.000 m` once homed (the monitor's `rail_pos_m`),
 * `rail not homed` (the amber pill) while unhomed, `no rail`, or the static
 * `rail 0–0.65 m` / `no rail` from the workcell config before any sample. */
export function railText(
  monitor: ArmMonitorTelemetry | null | undefined,
  arm: { has_rail?: boolean },
): string {
  switch (railState(monitor)) {
    case "homed":
      return monitor?.rail_pos_m != null ? `rail ${formatM(monitor.rail_pos_m)}` : "rail homed";
    case "unhomed":
      return RAIL_NOT_HOMED;
    case "none":
      return "no rail";
    case "unknown":
      return arm.has_rail === true ? "rail 0–0.65 m" : "no rail";
  }
}

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
  /** A hardware session owns the boxes (`SessionInfo.kind === "hardware"`, or
   * `hardware_monitor.paused` with no maintenance op running anywhere — a
   * paused monitor WITH one is a `RailHomingJob`, see `homingInProgress`). */
  sessionActive: boolean;
  /** A rail homing (job or synchronous) runs on some hardware arm and no
   * session exists: every op on every card is refused by the runtime. */
  homingInProgress: boolean;
  clearEnabled: boolean;
  applyEnabled: boolean;
  /** Visible text beside the buttons when they are disabled for a reason the
   * card itself does not show: `REASON_USE_COCKPIT` (session) or
   * `REASON_HOMING_IN_PROGRESS` (a homing on ANOTHER arm; the busy arm's own
   * card shows the "maintenance running…" indicator instead). */
  reason: string | null;
  /** Phase-09c rail read-back (`railState`) and its card text (`railText`). */
  rail: RailState;
  railLabel: string;
  /** **Home rail** is offered while the track is present but unhomed … */
  homeRailShown: boolean;
  /** … and enabled iff no session owns the boxes, no op is running and the
   * controller reports `error_code == 0` (the runtime refuses otherwise). */
  homeRailEnabled: boolean;
  /** Visible reason under a disabled **Home rail** that the strip does not
   * already show (`REASON_CLEAR_FIRST`; session / busy have their own line). */
  homeRailReason: string | null;
  /** Session eligibility (`sessionGate`) + the code for its reason. */
  gate: SessionGate;
  /** The card's visible eligibility line (`sessionGateReason`) for the gates
   * the strip does not already explain — `monitor_off` / `error`; the
   * `rail_unhomed` case has its amber pill + Home rail button. Null when
   * eligible or while a session owns the boxes (the strip says so). */
  sessionReason: string | null;
  errorCode: number;
}

export function maintenanceView(
  monitor: ArmMonitorTelemetry | null | undefined,
  arm: Pick<ArmStatusInfo, "error_code"> & { has_rail?: boolean },
  sessionActive: boolean,
  homingInProgress = false,
): MaintenanceView {
  const errorCode = monitor?.error_code ?? arm.error_code;
  const warnCode = monitor?.warn_code ?? 0;
  const hasErrors = errorCode !== 0 || warnCode !== 0;
  const busy = monitor?.maintenance_busy === true;
  const mismatch = monitor?.backstops_match === false;
  // the runtime refuses every card op while a session owns the boxes OR a rail
  // homing runs anywhere (409 "rail homing in progress")
  const locked = sessionActive || homingInProgress;
  const parts: string[] = [];
  if (monitor?.collision_sensitivity != null)
    parts.push(`sensitivity ${monitor.collision_sensitivity}`);
  if (monitor?.tcp_load_kg != null) parts.push(`payload ${formatKg(monitor.tcp_load_kg)}`);
  const rail = railState(monitor);
  const homeRailShown = rail === "unhomed";
  const gate = sessionGate(monitor, arm);
  return {
    meta: parts.length > 0 ? parts.join(" · ") : null,
    mismatch,
    hasErrors,
    busy,
    sessionActive,
    homingInProgress,
    clearEnabled: hasErrors && !locked && !busy,
    applyEnabled: mismatch && !locked && !busy,
    reason: sessionActive
      ? REASON_USE_COCKPIT
      : homingInProgress && !busy
        ? REASON_HOMING_IN_PROGRESS
        : null,
    rail,
    railLabel: railText(monitor, arm),
    homeRailShown,
    homeRailEnabled: homeRailShown && !locked && !busy && errorCode === 0,
    homeRailReason:
      homeRailShown && !locked && !busy && errorCode !== 0 ? REASON_CLEAR_FIRST : null,
    gate,
    sessionReason:
      !locked && (gate === "monitor_off" || gate === "error")
        ? sessionGateReason(gate, errorCode)
        : null,
    errorCode,
  };
}

// -- Session eligibility (phase-09c, Hardware tab; phase-09d: every arm) ----------------
/** Why an arm cannot join a hardware session right now — the runtime's
 * refusal matrix (04-runtime §5), mirrored so the card and the launcher
 * explain it before the POST: the monitor must hold a live sample (the gate
 * twin is posed from it), the rail must be homed (position known) and the
 * controller error-free (`connect()` would latch). Priority = the order the
 * operator must fix them. Since phase-09d `SessionSpec.arms` is EVERY
 * configured hardware arm (no "Include in session" switch), so any arm's gate
 * blocks Teleop — the launcher names the arm. */
export type SessionGate = "ok" | "monitor_off" | "rail_unhomed" | "error";

export function sessionGate(
  monitor: ArmMonitorTelemetry | null | undefined,
  arm: Pick<ArmStatusInfo, "error_code">,
): SessionGate {
  if (!monitorLive(monitor)) return "monitor_off";
  if (railState(monitor) === "unhomed") return "rail_unhomed";
  if ((monitor?.error_code ?? arm.error_code) !== 0) return "error";
  return "ok";
}

/** Visible reason for a gate (`null` when the arm is eligible): the arm card's
 * eligibility line (`monitor_off` / `error`; the rail case has its pill). */
export function sessionGateReason(gate: SessionGate, errorCode = 0): string | null {
  switch (gate) {
    case "ok":
      return null;
    case "monitor_off":
      return "Monitor not connected — no sample to pose the twin";
    case "rail_unhomed":
      return "Rail not homed — use Home rail";
    case "error":
      return errorCode !== 0
        ? `Controller error C${errorCode} — clear errors first`
        : "Controller error — clear errors first";
  }
}

// -- RailSweepVerdict copy (HomeRailSheet) ---------------------------------------------
/** One line per fact of the twin sweep, in reading order — the sheet renders
 * them as a list. `clear` decides the headline (`sweepHeadline`). */
export interface SweepSummary {
  /** `Sweep clear — safe to home`; `Sweep blocked — homing refused`; phase-09d:
   * `Current posture blocks the sweep — pre-positioning planned` /
   * `Sweep blocked — no safe pre-positioning path`. */
  headline: string;
  /** `"Full travel 0–0.650 m at the current posture · inflation 25 mm · step 5 mm"` */
  recipe: string;
  /** `"first blocked at 0.120 m: grip/link6 ↔ table"`; null when clear. */
  blocked: string | null;
  /** `"min clearance 32 mm at 0.315 m (grip/link2 ↔ table)"`; null when no pair was measured. */
  clearance: string | null;
  /** `"Perception Arm posed at its last sample (rail 0.000 m)"` per other arm. */
  others: string[];
  /** The runtime's `assumptions`, verbatim. */
  assumptions: string[];
}

export function sweepSummary(v: RailSweepVerdict): SweepSummary {
  const travel = v.travel_m ?? 0.65;
  const blockedPair = v.first_blocked_pair ?? [];
  const minPair = v.min_clearance_pair ?? [];
  const others = Object.entries(v.other_arms ?? {}).map(([id, q]) => {
    const rail = q.length > 7 ? q[7] : undefined;
    return `${armLabel(id)} posed at its last sample${rail != null ? ` (rail ${formatM(rail)})` : ""}`;
  });
  const plan = prePositionKind(v.pre_position);
  return {
    headline: v.clear
      ? "Sweep clear — safe to home"
      : plan === "planned"
        ? "Current posture blocks the sweep — pre-positioning planned"
        : plan === "refused"
          ? "Sweep blocked — no safe pre-positioning path"
          : "Sweep blocked — homing refused",
    recipe: `Full travel 0–${formatM(travel)} at the current posture · inflation ${formatMm(v.inflation_m)} · step ${formatMm(v.step_m)}`,
    blocked:
      !v.clear && v.first_blocked_m != null
        ? `first blocked at ${formatM(v.first_blocked_m)}${blockedPair.length > 0 ? `: ${pairText(blockedPair)}` : ""}`
        : !v.clear
          ? "blocked — see the assumptions below"
          : null,
    clearance:
      v.min_clearance_m != null
        ? `min clearance ${formatMm(v.min_clearance_m)}${v.min_clearance_at_m != null ? ` at ${formatM(v.min_clearance_at_m)}` : ""}${minPair.length > 0 ? ` (${pairText(minPair)})` : ""}`
        : null,
    others,
    assumptions: v.assumptions ?? [],
  };
}

// -- PrePositionPlan copy (HomeRailSheet, phase-09d) -----------------------------------
/** How the sheet reads a dry-run verdict's `pre_position` (phase-09d):
 * `none` — no plan block (pre-09d runtime) or `needed: false` → the 09c
 * synchronous flow (the rail homes with the joints untouched); `planned` —
 * the posture is not sweep-clear but the runtime found a position-agnostic
 * path to a clear posture → the sheet explains the motion and the confirm
 * starts an asynchronous job (202); `refused` — no plan was found, homing is
 * refused and `detail` tells the operator what to do. */
export type PrePositionKind = "none" | "planned" | "refused";

export const prePositionKind = (plan: PrePositionPlan | null | undefined): PrePositionKind =>
  !plan || !plan.needed ? "none" : plan.clear === false ? "refused" : "planned";

/** Copy of a planned pre-positioning motion (phase-09d contract wording). */
export interface PrePositionSummary {
  /** `The arm will first move along a planned path (12 waypoints, ~19 s at
   * 10 %) to a folded posture that clears the whole rail travel, then the
   * rail homes, then the arm holds that posture.` */
  explanation: string;
  /** `Target posture · joints 1–7: 180.0°, 0.0°, …` (null when the plan
   * carries no `target_q`). */
  target: string | null;
  /** `path checked at 131 rail positions · posture from the scene keyframe`. */
  validation: string;
}

const PLAN_SOURCE_TEXT: Readonly<Record<NonNullable<PrePositionPlan["source"]>, string>> = {
  current: "the current posture",
  keyframe: "the scene keyframe",
  home: "the arm's home keyframe",
  search: "a sampled posture",
};

export function prePositionSummary(plan: PrePositionPlan): PrePositionSummary {
  const waypoints = plan.waypoints ?? 0;
  const seconds = Math.max(1, Math.round(plan.duration_s ?? 0));
  const target = plan.target_q ?? [];
  const checked = plan.checked_rail_positions ?? 0;
  return {
    explanation: `The arm will first move along a planned path (${waypoints} waypoint${waypoints === 1 ? "" : "s"}, ~${seconds} s at 10 %) to a folded posture that clears the whole rail travel, then the rail homes, then the arm holds that posture.`,
    target:
      target.length > 0
        ? `Target posture · joints 1–${target.length}: ${target.map(formatDeg).join(", ")}`
        : null,
    validation: `path checked at ${checked} rail position${checked === 1 ? "" : "s"} · posture from ${PLAN_SOURCE_TEXT[plan.source ?? "current"]}`,
  };
}

/** The operator's way out of a refused plan (the runtime's `detail` carries the
 * specific suggestion; this is the generic one when it does not). */
export const PRE_POSITION_REFUSED_HINT =
  "No collision-free path to a rail-clear posture was found — fold the arm toward the factory-zero posture in xArm Studio and open Home rail again.";

// -- RailHomingJob phases (HomeRailSheet progress view, phase-09d) ----------------------
/** The job's phases in execution order (`MaintenancePhase` minus the two
 * terminal values); the sheet lists them all so the operator sees where the
 * job is and what is still to come. */
export const MAINTENANCE_PHASES = [
  "queued",
  "sweeping",
  "planning",
  "connecting",
  "positioning",
  "homing",
  "verifying",
] as const satisfies readonly MaintenanceProgress["phase"][];

export const PHASE_LABELS: Readonly<Record<MaintenanceProgress["phase"], string>> = {
  queued: "queued",
  sweeping: "sweeping the rail travel in the twin",
  planning: "planning the pre-positioning path",
  connecting: "connecting the arm (the monitor pauses)",
  positioning: "moving the arm to the folded posture at 10 %",
  homing: "homing the carriage (operator's LEFT end)",
  verifying: "verifying the track registers",
  done: "done — the arm holds the folded posture",
  failed: "failed",
};

export type PhaseState = "done" | "active" | "pending" | "failed";

/** State of one listed phase given the job's current phase: everything before
 * the current one is `done`, the current one `active`, the rest `pending`; a
 * terminal `done` marks every row done; a terminal `failed` marks the phase
 * the job was in when it failed (`failedAt`, the last non-terminal phase the
 * sheet saw; the job's own last phase when unknown) `failed`, the rows before
 * it done and the rest pending. */
export function phaseState(
  phase: (typeof MAINTENANCE_PHASES)[number],
  current: MaintenanceProgress["phase"],
  failedAt: (typeof MAINTENANCE_PHASES)[number] | null = null,
): PhaseState {
  if (current === "done") return "done";
  const i = MAINTENANCE_PHASES.indexOf(phase);
  if (current === "failed") {
    const f =
      failedAt === null ? MAINTENANCE_PHASES.length - 1 : MAINTENANCE_PHASES.indexOf(failedAt);
    return i < f ? "done" : i === f ? "failed" : "pending";
  }
  const c = MAINTENANCE_PHASES.indexOf(current);
  return i < c ? "done" : i === c ? "active" : "pending";
}

export const isTerminalPhase = (phase: MaintenanceProgress["phase"] | null | undefined): boolean =>
  phase === "done" || phase === "failed";

/** The values `apply_backstops` WROTE, parsed from the runtime's detail
 * (`"safety settings applied: sensitivity 3, payload 0.95 kg at (0, 0, 60) mm
 * …"`); null when the detail does not carry them. */
const WRITTEN_BACKSTOPS = /sensitivity (\d+), payload (\d+(?:\.\d+)?) kg/;
/** The monitor's note when the rich report frame had not echoed the new
 * values within its 0.5 s settle window: `"(read-back not yet reflected: …)"`. */
const READBACK_LAG = /\((read-back[^)]*)\)/;

/** Toast for a 200 `ArmMaintenanceResult` (the runtime answers 200 whether or
 * not `ok`): `Manipulation Arm · errors cleared`, `Manipulation Arm · rail
 * homed (rail 0.000 m)`, `Manipulation Arm · safety
 * settings applied (sensitivity 3, payload 0.95 kg)` — the parenthesis names
 * the values WRITTEN (from the runtime `detail`; the `after` read-back is the
 * fallback, omitted when neither exists); when the controller has not echoed
 * them yet (`after.backstops_match === false`) or non-fatal `warnings` came
 * back, the tone is amber and the note / warnings are appended —
 * `Manipulation Arm · re-grip the clutch to continue`; `ok: false` → error
 * tone with the runtime's `detail` (a phase-09d `status: "refused"` is `ok:
 * false` too). A `status: "accepted"` (202 — the asynchronous `RailHomingJob`
 * started) is not a result yet: the sheet renders the progress instead and
 * toasts the job's FINAL result from `/maintenance/last`; if toasted anyway it
 * reads `Manipulation Arm · rail homing started — pre-positioning first`. */
export function maintenanceToast(result: ArmMaintenanceResult): { text: string; tone: ToastTone } {
  const label = armLabel(result.arm_id);
  if (!result.ok) {
    return { text: `${label} · ${result.detail || `${result.op} failed`}`, tone: "error" };
  }
  if (result.status === "accepted") {
    return { text: `${label} · rail homing started — pre-positioning first`, tone: "info" };
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
    case "home_rail": {
      // Dry runs are rendered by the HomeRailSheet, never toasted; a real op
      // reports the homed position from the `after` sample when it has one.
      const pos = result.after?.rail_pos_m;
      let text = `${label} · rail homed${pos != null ? ` (rail ${formatM(pos)})` : ""}`;
      const notes = result.warnings ?? [];
      if (notes.length > 0) {
        text += ` — ${notes.join("; ")}`;
        return { text, tone: "warning" };
      }
      return { text, tone: "success" };
    }
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
