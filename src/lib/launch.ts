/** Pure launch logic shared by the Welcome page and the LaunchSheet
 * (05-ui §8.1, phase-11 §4; phase-09c hardware gating; phase-09d: every
 * hardware arm joins the session): the selection → blocking reason matrix,
 * the SessionSpec serializer and the Hardware-tab speed default. No React, no
 * I/O — unit-tested in Landing.test.tsx. */
import type { PolicyInfo, SessionSpec } from "../gen";
import { armLabel, orderArms } from "./streams";
import type { FrameRef, Kind, Mode } from "./types";

export interface LandingSelection {
  /** Welcome tab (Hardware | Sim); the session `kind` follows it. */
  tab: Kind;
  kind: Kind;
  /** Arm ids that join the session — EVERY arm of the tab's workcell on both
   * tabs, Manipulation Arm first (phase-09d: a hardware session must include
   * every configured arm, the runtime 409s a subset — the phase-09c "Include
   * in session" switch is gone). */
  arms: string[];
  frames: Record<string, FrameRef>;
  simScene: string | null;
  twinScene: string | null;
  startFrom: "keep_current" | "profile";
  profileId: string | null;
  task: string;
  policyId: string | null;
  keymapOk: boolean;
  policiesAvailable: boolean;
  /** `WorkcellStatus.hardware_ready`: every configured hardware arm answers on :502. */
  hardwareReady: boolean;
  /** `available_kinds` includes "hardware" (the runtime config has a hardware block). */
  hardwareConfigured: boolean;
  // -- phase-09c, Hardware tab only (all optional: sim / older callers omit them) --
  /** `SessionSpec.speed_scale` (0 < s ≤ 1); `DEFAULT_SPEED_SCALE` when omitted. */
  speedScale?: number;
  /** Arms whose linear track is present but not homed (monitor rows) — ANY
   * arm blocks Teleop (phase-09d), the reason names them. */
  unhomedRailArms?: string[];
  /** Arms the twin cannot be posed for / with a latched controller error. */
  armsNotReady?: string[];
  /** A tracker calibration run is live (`isCalibrationActive`): the runtime
   * refuses every session while it is, on both tabs. */
  calibrationActive?: boolean;
  /** Any hardware arm reports `maintenance_busy` (a `home_rail` in flight). */
  homingInProgress?: boolean;
}

/** Visible disabled reasons (phase-11 §4 ModeLauncher; phase-09c additions).
 * `railNotHomed` / `armNotReady` are the per-arm SUFFIXES — the visible text
 * is `armReason(arms, suffix)`, e.g. `Perception Arm: rail not homed — use
 * Home rail` (phase-09d: every arm joins the session, so the reason must say
 * which one blocks). */
export const REASON = {
  keymap: "Keymap unavailable — retry",
  hardwareNotConfigured: "Hardware workcell not configured",
  hardwareTeleopOnly: "Hardware sessions support teleop only for now",
  noArmsDetected: "Requires real arms — none detected",
  noWorkcellArms: "No arms in the workcell",
  railNotHomed: "rail not homed — use Home rail",
  homingInProgress: "Rail homing in progress — wait for it to finish",
  armNotReady: "not ready — see the arm card",
  noSimScene: "Scene unavailable — mavis_v2 missing from the sim registry",
  noTwinScene: "Hardware sessions require a digital-twin scene",
  noProfile: "Select a profile to load",
  noTask: "Task is required",
  noPolicies: "No policies available",
  noPromoted: "No promoted checkpoint",
  // 2026-09-07: the runtime 409s POST /api/session while a tracker calibration
  // run is live (`rest.py` post_session, "tracker calibration in progress"), and
  // both wizards are reachable from the Welcome page's Setting tab now — so the
  // launcher has to say it instead of letting the operator meet the 409.
  calibrationActive: "Tracker calibration in progress — finish or abort it on the Setting tab",
} as const;

/** `["view"]` + `REASON.railNotHomed` → `"Perception Arm: rail not homed — use
 * Home rail"`; several arms are listed Manipulation Arm first, comma-separated
 * (`"Manipulation Arm, Perception Arm: rail not homed — use Home rail"`). */
export const armReason = (arms: readonly string[], suffix: string): string =>
  `${orderArms(arms, (a) => a)
    .map(armLabel)
    .join(", ")}: ${suffix}`;

/** Hardware-tab **Speed** segments (phase-09c D2): `SessionSpec.speed_scale`
 * multiplies every host- and driver-side velocity cap; the first real runs
 * use 10 %. The runtime's `hardware_session.default_speed_scale` is 0.1 too. */
export const SPEED_OPTIONS = [
  { value: "0.1", scale: 0.1, label: "10%" },
  { value: "0.3", scale: 0.3, label: "30%" },
  { value: "1", scale: 1, label: "100%" },
] as const;
export type SpeedValue = (typeof SPEED_OPTIONS)[number]["value"];
export const DEFAULT_SPEED_SCALE = 0.1;
/** `0.1` → `"10%"` (Cockpit badge, launcher copy). */
export const speedLabel = (scale: number): string => `${Math.round(scale * 100)}%`;

/** Validation matrix — returns the first blocking reason or null.
 * Hardware tab: teleop only (phase-09c), then gated on `hardwareConfigured &&
 * hardwareReady` before anything else about the workcell, then the phase-09c
 * arm rules over EVERY arm (phase-09d: rails homed, no homing in flight, every
 * arm eligible — the reason names the arm(s)); Sim tab: the classic rules. */
export function validateLaunch(mode: Mode, sel: LandingSelection): string | null {
  if (!sel.keymapOk) return REASON.keymap;
  if (sel.calibrationActive) return REASON.calibrationActive;
  if (sel.tab === "hardware") {
    if (mode !== "teleop") return REASON.hardwareTeleopOnly;
    if (!sel.hardwareConfigured) return REASON.hardwareNotConfigured;
    if (!sel.hardwareReady) return REASON.noArmsDetected;
  }
  if (sel.arms.length === 0) return REASON.noWorkcellArms;
  for (const a of sel.arms) if (!sel.frames[a]) return `No recording frame for ${a}`;
  if (sel.kind === "sim" && !sel.simScene) return REASON.noSimScene;
  if (sel.kind === "hardware" && !sel.twinScene) return REASON.noTwinScene;
  if (sel.tab === "hardware") {
    if (sel.homingInProgress) return REASON.homingInProgress;
    if ((sel.unhomedRailArms?.length ?? 0) > 0)
      return armReason(sel.unhomedRailArms ?? [], REASON.railNotHomed);
    if ((sel.armsNotReady?.length ?? 0) > 0)
      return armReason(sel.armsNotReady ?? [], REASON.armNotReady);
  }
  if (sel.startFrom === "profile" && !sel.profileId) return REASON.noProfile;
  if ((mode === "collect" || mode === "dagger") && sel.task.trim() === "") return REASON.noTask;
  if (mode === "dagger" && !sel.policiesAvailable) return REASON.noPolicies;
  if (mode === "inference" && (!sel.policiesAvailable || !sel.policyId)) return REASON.noPromoted;
  return null;
}

/** Card-level gate for the ModeLauncher: what the LaunchSheet collects later
 * (task, policy) is assumed satisfiable — Inference only when a promoted
 * checkpoint exists (the sheet lists promoted checkpoints only). */
export function launcherReason(
  mode: Mode,
  sel: LandingSelection,
  promoted: readonly PolicyInfo[],
): string | null {
  const probe: LandingSelection = {
    ...sel,
    task: mode === "collect" || mode === "dagger" ? sel.task || "pending" : sel.task,
    policyId:
      mode === "inference" ? (promoted[promoted.length - 1]?.policy_id ?? null) : sel.policyId,
  };
  return validateLaunch(mode, probe);
}

export function buildSpec(mode: Mode, sel: LandingSelection): SessionSpec {
  return {
    mode,
    kind: sel.kind,
    arms: sel.arms,
    frames: Object.fromEntries(sel.arms.map((a) => [a, sel.frames[a] ?? `arm_base:${a}`])),
    ...(sel.kind === "sim" ? { sim_scene: sel.simScene ?? undefined } : {}),
    ...(sel.kind === "hardware"
      ? {
          digital_twin_scene: sel.twinScene ?? undefined,
          speed_scale: sel.speedScale ?? DEFAULT_SPEED_SCALE,
        }
      : {}),
    start_from: sel.startFrom === "profile" ? `profile:${sel.profileId}` : "keep_current",
    ...(mode === "collect" || mode === "dagger" ? { task: sel.task.trim() } : {}),
    ...((mode === "dagger" || mode === "inference") && sel.policyId
      ? { policy: sel.policyId }
      : {}),
  };
}
