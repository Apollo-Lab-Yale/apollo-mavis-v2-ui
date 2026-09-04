/** Pure launch logic shared by the Welcome page and the LaunchSheet
 * (05-ui §8.1, phase-11 §4): the selection → blocking reason matrix and the
 * SessionSpec serializer. No React, no I/O — unit-tested in Landing.test.tsx. */
import type { PolicyInfo, SessionSpec } from "../gen";
import type { FrameRef, Kind, Mode } from "./types";

export interface LandingSelection {
  /** Welcome tab (Hardware | Sim); the session `kind` follows it. */
  tab: Kind;
  kind: Kind;
  arms: string[]; // arm ids of the tab's workcell (all included)
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
}

/** Visible disabled reasons (phase-11 §4 ModeLauncher). */
export const REASON = {
  keymap: "Keymap unavailable — retry",
  hardwareNotConfigured: "Hardware workcell not configured",
  noArmsDetected: "Requires real arms — none detected",
  noWorkcellArms: "No arms in the workcell",
  noSimScene: "Scene unavailable — mavis_v2 missing from the sim registry",
  noTwinScene: "Hardware sessions require a digital-twin scene",
  noProfile: "Select a profile to load",
  noTask: "Task is required",
  noPolicies: "No policies available",
  noPromoted: "No promoted checkpoint",
} as const;

/** Validation matrix — returns the first blocking reason or null.
 * Hardware tab: gated on `hardwareConfigured && hardwareReady` before anything
 * else about the workcell; Sim tab: the classic rules. */
export function validateLaunch(mode: Mode, sel: LandingSelection): string | null {
  if (!sel.keymapOk) return REASON.keymap;
  if (sel.tab === "hardware") {
    if (!sel.hardwareConfigured) return REASON.hardwareNotConfigured;
    if (!sel.hardwareReady) return REASON.noArmsDetected;
  }
  if (sel.arms.length === 0) return REASON.noWorkcellArms;
  for (const a of sel.arms) if (!sel.frames[a]) return `No recording frame for ${a}`;
  if (sel.kind === "sim" && !sel.simScene) return REASON.noSimScene;
  if (sel.kind === "hardware" && !sel.twinScene) return REASON.noTwinScene;
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
    ...(sel.kind === "hardware" ? { digital_twin_scene: sel.twinScene ?? undefined } : {}),
    start_from: sel.startFrom === "profile" ? `profile:${sel.profileId}` : "keep_current",
    ...(mode === "collect" || mode === "dagger" ? { task: sel.task.trim() } : {}),
    ...((mode === "dagger" || mode === "inference") && sel.policyId
      ? { policy: sel.policyId }
      : {}),
  };
}
