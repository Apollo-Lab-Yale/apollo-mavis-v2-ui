/** Pure launch logic shared by the Welcome page, the LaunchSheet and the
 * OnlineDaggerSheet (05-ui §8.1, phase-11 §4; phase-09c hardware gating; phase-09d:
 * every hardware arm joins the session; phase-14 Online DAgger, 15-online-dagger §5 /
 * §8; 2026-09-11: Inference from the attached external policy node): the selection →
 * blocking reason matrix, the SessionSpec serializer, the Hardware-tab speed default
 * and the Online DAgger form defaults. No React, no I/O — unit-tested in
 * Landing.test.tsx and launch.test.ts. */
import onlineDaggerSchema from "../../schemas/OnlineDaggerConfig.json";
import sessionSpecSchema from "../../schemas/SessionSpec.json";
import type {
  ActionFilterConfig,
  DatasetLayoutInfo,
  OnlineDaggerConfig,
  PolicyInfo,
  SessionSpec,
} from "../gen";
import { armLabel, orderArms } from "./streams";
import type { FrameRef, Kind, Mode } from "./types";

/** `SessionSpec.dataset`'s regex (core `DATASET_RE`: an optional `namespace/`
 * then a slug of letters, digits, `_` and `-`), read from the vendored core
 * schema `schemas/SessionSpec.json` — never hard-coded here. The JSON is typed
 * precisely (`resolveJsonModule`), so a renamed key or a dropped `pattern` is a
 * tsc failure, not a module-load throw; the throw is only a belt-and-braces guard. */
function schemaDatasetPattern(): string {
  const pattern = sessionSpecSchema.properties.dataset.anyOf.find(
    (b) => typeof b.pattern === "string",
  )?.pattern;
  if (!pattern) throw new Error("SessionSpec.json: dataset has no pattern");
  return pattern;
}
export const DATASET_PATTERN = schemaDatasetPattern();
export const DATASET_RE = new RegExp(DATASET_PATTERN);

/** Slug the operator's text into a bare dataset NAME that matches `DATASET_RE`:
 * lowercase, runs of anything else -> `_`, no leading separator ("pick red cube"
 * -> "pick_red_cube"; "" when nothing usable is left). */
export function slugDataset(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[_-]+/, "")
    .replace(/_+$/, "");
  return DATASET_RE.test(slug) ? slug : "";
}

/** The directory a namespace's datasets live in (15-online-dagger §7 / D5): the
 * mapped root when the runtime maps the namespace, else `<generic_root>/<ns>`. */
export function namespaceRoot(layout: DatasetLayoutInfo, ns: string): string {
  const mapped = layout.namespaces[ns];
  return mapped ? mapped.root : `${layout.generic_root}/${ns}`;
}
/** Data Collection preview: the REAL folder of a new dataset —
 * `<root of the default namespace>/<slug>` (`~/data/bc_demo/pick_cube`); `…` for
 * an empty slug. Without the layout (still loading, or an older runtime without
 * `GET /api/datasets/layout`) the folder is unknown and the preview says so with a
 * namespace-free `…/<slug>` — the UI never hard-codes a namespace (15-online-dagger
 * §7 / §8; the runtime's default is its `datasets.default_namespace`). */
export function datasetFolderPreview(layout: DatasetLayoutInfo | null, slug: string): string {
  const root = layout ? namespaceRoot(layout, layout.default_namespace) : "…";
  return `${root}/${slug || "…"}`;
}

/** `OnlineDaggerConfig.session_name`'s regex (core `SLUG_RE`), read from the
 * vendored schema `schemas/OnlineDaggerConfig.json` — never hard-coded here (typed
 * JSON: schema drift fails tsc, see `schemaDatasetPattern`). */
function schemaSessionPattern(): string {
  const pattern: string = onlineDaggerSchema.properties.session_name.pattern;
  if (!pattern) throw new Error("OnlineDaggerConfig.json: session_name has no pattern");
  return pattern;
}
export const SESSION_PATTERN = schemaSessionPattern();
export const SESSION_RE = new RegExp(SESSION_PATTERN);
/** `OnlineDaggerConfig.session_name`'s length cap (core `max_length`; the name
 * becomes a directory under the online_dagger root), read from the same schema. */
function schemaSessionMaxLength(): number {
  const maxLength: number = onlineDaggerSchema.properties.session_name.maxLength;
  if (!Number.isFinite(maxLength))
    throw new Error("OnlineDaggerConfig.json: session_name has no maxLength");
  return maxLength;
}
export const SESSION_MAX_LENGTH = schemaSessionMaxLength();
/** Slug the operator's text into an Online DAgger session name (`SLUG_RE`: letters,
 * digits, `_`, `-`, no leading separator; case kept). "" when nothing usable is left.
 * The slug is NOT truncated to `SESSION_MAX_LENGTH` — the operator must see the name
 * that will be posted; `sessionNameReason` refuses an over-long one instead. */
export function slugSession(text: string): string {
  const slug = text
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^[_-]+/, "")
    .replace(/_+$/, "");
  return SESSION_RE.test(slug) ? slug : "";
}
/** Why the typed session name cannot be posted: `REASON.sessionName` when nothing
 * sluggable is left, `REASON.sessionNameTooLong` past the schema's `maxLength`
 * (the runtime would 422); null when it is fine. */
export function sessionNameReason(text: string): string | null {
  const slug = slugSession(text);
  if (slug === "") return REASON.sessionName;
  if (slug.length > SESSION_MAX_LENGTH) return REASON.sessionNameTooLong;
  return null;
}
/** The `online_dagger` namespace id (rollout repo ids `online_dagger/<session_name>`). */
export const ONLINE_DAGGER_NAMESPACE = "online_dagger";
/** Online DAgger session directory preview: `<online_dagger root>/<slug>`
 * (`~/data/online_dagger/<slug>`; the rollouts dataset sits in its `rollouts/`
 * sub-folder, the trainer's own artefacts wherever it likes). Without the layout
 * the namespace stands in for the root. */
export function onlineDaggerFolderPreview(layout: DatasetLayoutInfo | null, slug: string): string {
  const root = layout
    ? namespaceRoot(layout, ONLINE_DAGGER_NAMESPACE)
    : `…/${ONLINE_DAGGER_NAMESPACE}`;
  return `${root}/${slug || "…"}`;
}

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
  /** Inference only (2026-09-11): where the policy comes from — a promoted
   * `checkpoint` of the runtime's registry (the default; `policyId` names it) or the
   * `external` policy node attached over the dora bus (`policy_source: "external"`,
   * no `policy`). Undefined = "checkpoint". */
  policySource?: "checkpoint" | "external";
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
  // -- Data Collection (2026-09-07; 04-runtime §10.5) — the LaunchSheet fills these --
  /** "new" (default) = `dataset_resume: false` with a slugged `datasetName`;
   * "existing" = `dataset_resume: true` with the picked `datasetRepoId`. */
  datasetMode?: "new" | "existing";
  /** The operator's raw text for a new dataset; `slugDataset` makes the name. */
  datasetName?: string;
  /** `DatasetInfo.repo_id` picked under "Continue existing". */
  datasetRepoId?: string | null;
  /** `SessionSpec.return_to_start` (DEFAULT true — operator decision 2026-09-07). */
  returnToStart?: boolean;
  /** A designated initial-condition profile exists for the tab's kind (the
   * fallback return target when no `start_from` profile is chosen). */
  hasInitialCondition?: boolean;
  /** Idle-frame filter (2026-09-07 addendum; 04-runtime §10.5): the sheet's
   * checkbox + the five operator-unit inputs (mm / mrad / % / mm / s); `buildSpec`
   * converts them to SI into `SessionSpec.action_filter`. Undefined = the runtime
   * defaults (checked). */
  actionFilter?: ActionFilterInputs;
  // -- Online DAgger (phase-14; 15-online-dagger §5 / §8) — the OnlineDaggerSheet fills these --
  /** The sheet's form; undefined = a card-level probe (assumed satisfiable). */
  onlineDagger?: OnlineDaggerInputs;
  /** An external policy node is attached and fresh (`telemetry.external`:
   * `enabled && state === "attached" && policy_attached`). Undefined = unknown
   * (not judged); false = `REASON.noTrainer`. */
  trainerAttached?: boolean;
  /** The same attachment, judged policy-neutrally (`externalPolicyAttached`,
   * `components/externalPolicy.tsx`) for an Inference launch with
   * `policySource: "external"` (2026-09-11): undefined = not judged; false =
   * `REASON.noExternalPolicy`. `validateLaunch` reads either flag. */
  externalAttached?: boolean;
  /** The attached node reports the `online_dagger` capability
   * (`telemetry.external.capabilities`, the fresh spec's list — session-less since
   * phase-14). `null` / undefined = the runtime predates the field (not judged — it
   * 409s at launch with its own reason); false = `REASON.trainerNoCapability`. */
  trainerCapability?: boolean | null;
}

/** The OnlineDaggerSheet's form (15-online-dagger §5): ONLY what the shell itself
 * needs — the session directory name, whether an existing one is continued, and
 * the two generic gates on `episode_new`. No hyper-parameter travels here: which
 * DAgger variant runs and how it trains is the trainer node's own configuration
 * (operator decision 2026-09-08), so `onlineDaggerToSpec` is a pure rename. */
export interface OnlineDaggerInputs {
  /** Raw text; `slugSession` makes the `session_name`. */
  sessionName: string;
  /** True when an existing session of that name is being continued. */
  resume: boolean;
  /** `episode_new` is refused while the trainer reports `training` (the arms stay
   * parked between rollouts). */
  pauseWhileTraining: boolean;
  /** The first rollout waits until the trainer has reported `ready` for THIS session. */
  waitForTrainerReady: boolean;
}
export const DEFAULT_ONLINE_DAGGER: OnlineDaggerInputs = {
  sessionName: "",
  resume: false,
  pauseWhileTraining: true,
  waitForTrainerReady: true,
};

/** Form → the wire `OnlineDaggerConfig` (15-online-dagger §5): a pure rename. Every
 * key travels — and ONLY the schema's keys: core forbids extras
 * (`additionalProperties: false`, a 422). An over-long name THROWS:
 * `validateLaunch` disables Start with the same message first, so a caller that
 * still posts is a bug and must not silently truncate. */
export function onlineDaggerToSpec(inputs: OnlineDaggerInputs): OnlineDaggerConfig {
  const nameReason = sessionNameReason(inputs.sessionName);
  if (nameReason === REASON.sessionNameTooLong)
    throw new Error(`onlineDaggerToSpec: ${nameReason}`);
  return {
    session_name: slugSession(inputs.sessionName),
    resume: inputs.resume,
    pause_while_training: inputs.pauseWhileTraining,
    wait_for_trainer_ready: inputs.waitForTrainerReady,
  };
}

/** The LaunchSheet's filter inputs in OPERATOR units (defaults = pro-dagger's). */
export interface ActionFilterInputs {
  enabled: boolean;
  posMm: number;
  rotMrad: number;
  gripperPct: number;
  railMm: number;
  gripperContextS: number;
}
export const DEFAULT_ACTION_FILTER: ActionFilterInputs = {
  enabled: true,
  posMm: 1,
  rotMrad: 1,
  gripperPct: 1,
  railMm: 1,
  gripperContextS: 1.6,
};
/** Operator units -> the SI `ActionFilterConfig` the runtime takes. */
export function actionFilterToSpec(inputs: ActionFilterInputs): ActionFilterConfig {
  const num = (v: number, fallback: number) => (Number.isFinite(v) && v >= 0 ? v : fallback);
  return {
    enabled: inputs.enabled,
    pos_eps_m: num(inputs.posMm, DEFAULT_ACTION_FILTER.posMm) / 1000,
    rot_eps_rad: num(inputs.rotMrad, DEFAULT_ACTION_FILTER.rotMrad) / 1000,
    gripper_eps_frac: num(inputs.gripperPct, DEFAULT_ACTION_FILTER.gripperPct) / 100,
    rail_eps_m: num(inputs.railMm, DEFAULT_ACTION_FILTER.railMm) / 1000,
    gripper_context_s: num(inputs.gripperContextS, DEFAULT_ACTION_FILTER.gripperContextS),
  };
}

/** Visible disabled reasons (phase-11 §4 ModeLauncher; phase-09c additions).
 * `railNotHomed` / `armNotReady` are the per-arm SUFFIXES — the visible text
 * is `armReason(arms, suffix)`, e.g. `Perception Arm: rail not homed — use
 * Home rail` (phase-09d: every arm joins the session, so the reason must say
 * which one blocks). */
export const REASON = {
  keymap: "Keymap unavailable — retry",
  hardwareNotConfigured: "Hardware workcell not configured",
  hardwareTeleopOnly: "Hardware sessions support teleop and data collection only for now",
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
  // Inference from the external policy node (2026-09-11)
  noExternalPolicy:
    "Attach an external policy node first (dora bridge attached with a fresh policy spec)",
  // Data Collection (2026-09-07; 05-ui §8.1 item 6)
  datasetName: "Dataset name is required",
  datasetPick: "Pick a dataset to continue, or start a new one",
  returnNeedsProfile:
    "Return to start needs a start profile or an initial condition — pick one or untick",
  // 2026-09-07: the runtime 409s POST /api/session while a tracker calibration
  // run is live (`rest.py` post_session, "tracker calibration in progress"), and
  // both wizards are reachable from the Welcome page's Setting tab now — so the
  // launcher has to say it instead of letting the operator meet the 409.
  calibrationActive: "Tracker calibration in progress — finish or abort it on the Setting tab",
  // Online DAgger (phase-14; 15-online-dagger §8 footer reasons)
  sessionName: "Session name is required",
  sessionNameTooLong: `Session name must be at most ${SESSION_MAX_LENGTH} characters`,
  noTrainer:
    "Attach an Online DAgger trainer first (policy node with the online_dagger capability)",
  trainerNoCapability:
    "The attached policy node does not report the online_dagger capability — start it with a trainer",
} as const;

/** The OnlineDaggerSheet's caption while the SESSION-LESS heartbeat
 * (`telemetry.external.trainer_status`) reports `state: "error"`. A WARNING, never a
 * `validateLaunch` refusal: the runtime does not 409 on it (15-online-dagger §7 lists
 * only the session-dir / attached / capability refusals — `_check_online_dagger`),
 * the coordinator takes nothing but aliveness from a status that echoes no live
 * session id, and the node's loop clears `error` on the next SessionAnnounce — so
 * starting a session IS the documented recovery path and must stay reachable. The
 * trainer's own detail is appended when it sent one. */
export const TRAINER_ERROR_WARNING =
  "Trainer reports an error — you can start, but check the policy node";
export const trainerErrorWarning = (detail: string): string =>
  detail.trim() ? `${TRAINER_ERROR_WARNING}: ${detail.trim()}` : TRAINER_ERROR_WARNING;

/** `["view"]` + `REASON.railNotHomed` → `"Perception Arm: rail not homed — use
 * Home rail"`; several arms are listed Manipulation Arm first, comma-separated
 * (`"Manipulation Arm, Perception Arm: rail not homed — use Home rail"`). */
export const armReason = (arms: readonly string[], suffix: string): string =>
  `${orderArms(arms, (a) => a)
    .map(armLabel)
    .join(", ")}: ${suffix}`;

/** Hardware-tab **Speed** segments (phase-09c D2): `SessionSpec.speed_scale`
 * multiplies every host- and driver-side velocity cap. 10 / 50 / 100 % with
 * **100 % pre-selected** since 2026-09-08 (the operator's call: 50 %, the
 * 2026-09-07 default, was found too slow on the real cell; 10 % was the
 * very-first-run setting and 30 % was never used). The runtime's
 * `hardware_session.default_speed_scale` is 1.0 to match — the two defaults
 * must not drift, the Cockpit badge shows whichever the session got. */
export const SPEED_OPTIONS = [
  { value: "0.1", scale: 0.1, label: "10%" },
  { value: "0.5", scale: 0.5, label: "50%" },
  { value: "1", scale: 1, label: "100%" },
] as const;
export type SpeedValue = (typeof SPEED_OPTIONS)[number]["value"];
/** Pre-selected segment; `DEFAULT_SPEED_SCALE` is its `scale` (asserted in
 * Landing.test.tsx, so the two can never disagree). */
export const DEFAULT_SPEED_VALUE: SpeedValue = "1";
export const DEFAULT_SPEED_SCALE = 1;
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
    if (mode === "dagger" || mode === "inference") return REASON.hardwareTeleopOnly;
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
  if (mode === "collect" && sel.datasetMode !== undefined) {
    // The LaunchSheet always fills the dataset fields (a selection without them is a
    // card-level probe or a pre-2026-09-07 caller and is judged on the rest).
    if (sel.datasetMode === "existing") {
      if (!sel.datasetRepoId) return REASON.datasetPick;
    } else if (slugDataset(sel.datasetName ?? "") === "") return REASON.datasetName;
    // D6: the flag is on by default; the runtime 409s without a return profile, so
    // Start is disabled with the same reason until a profile is picked or it is unticked.
    const hasStartProfile = sel.startFrom === "profile" && !!sel.profileId;
    if ((sel.returnToStart ?? true) && !hasStartProfile && !sel.hasInitialCondition)
      return REASON.returnNeedsProfile;
  }
  if (mode === "dagger" && sel.onlineDagger !== undefined) {
    // The OnlineDaggerSheet always fills the form (a selection without it is a
    // card-level probe and is judged on the rest). Form first — the name is the
    // operator's own fix — then the return target, then the external trainer
    // (attached, capable). An ERRORING trainer is not a refusal (the runtime does
    // not 409 on it; `trainerErrorWarning` is the sheet's caption instead).
    const nameReason = sessionNameReason(sel.onlineDagger.sessionName);
    if (nameReason !== null) return nameReason;
    const hasStartProfile = sel.startFrom === "profile" && !!sel.profileId;
    if ((sel.returnToStart ?? true) && !hasStartProfile && !sel.hasInitialCondition)
      return REASON.returnNeedsProfile;
    if (sel.trainerAttached === false) return REASON.noTrainer;
    if (sel.trainerCapability === false) return REASON.trainerNoCapability;
  }
  // Online DAgger (phase-14) runs the EXTERNAL policy node: checkpoints in the
  // runtime's registry (`policies_available`) do not gate it any more (D1).
  if (mode === "inference") {
    if (sel.policySource === "external") {
      // 2026-09-11: the attached policy node drives — the registry gates nothing;
      // the attachment does (either flag; undefined = not judged, the runtime 409s
      // "no external policy attached" on its own).
      if (externalAttachedOf(sel) === false) return REASON.noExternalPolicy;
    } else if (!sel.policiesAvailable || !sel.policyId) return REASON.noPromoted;
  }
  return null;
}

/** The attachment flag an Inference / Online DAgger selection carries:
 * `externalAttached` (policy-neutral) or the older `trainerAttached`; undefined when
 * neither was judged. */
export const externalAttachedOf = (sel: LandingSelection): boolean | undefined =>
  sel.externalAttached ?? sel.trainerAttached;

/** Card-level gate for the ModeLauncher: what the sheets collect later (task,
 * policy, the Online DAgger form, the trainer attachment) is assumed satisfiable —
 * Inference when a promoted checkpoint exists (the sheet lists promoted checkpoints)
 * OR, since 2026-09-11, when an external policy node is attached (`sel.externalAttached`
 * / `trainerAttached` from `telemetry.external`; the sheet's "External policy (dora)"
 * row): the probe picks the source the sheet would default to — checkpoint when one is
 * promoted, else external — so a promoted checkpoint keeps its `No promoted checkpoint`
 * reason only while no node is attached. Online DAgger on the Sim tab always reads
 * "Set up and start" (15-online-dagger §8); the Hardware tab keeps its teleop /
 * collect-only refusal (D7) for both. */
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
    ...(mode === "inference"
      ? { policySource: promoted.length ? ("checkpoint" as const) : ("external" as const) }
      : {}),
    // the sheet collects the dataset and can untick return-to-start: assume satisfiable
    ...(mode === "collect"
      ? {
          datasetMode: "new" as const,
          datasetName: sel.datasetName || "pending",
          returnToStart: false,
        }
      : {}),
    // the OnlineDaggerSheet collects the form and shows the trainer state itself
    ...(mode === "dagger"
      ? {
          onlineDagger: undefined,
          trainerAttached: undefined,
          externalAttached: undefined,
          trainerCapability: undefined,
        }
      : {}),
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
    ...(mode === "collect"
      ? {
          // a bare name: the runtime prefixes its `datasets.default_namespace`; an
          // existing pick is the full repo_id; NEVER an empty string (omitted = the
          // task-derived name)
          ...(datasetFor(sel) !== null ? { dataset: datasetFor(sel) as string } : {}),
          dataset_resume: sel.datasetMode === "existing",
          return_to_start: sel.returnToStart ?? true,
        }
      : {}),
    ...(mode === "collect" || mode === "dagger"
      ? { action_filter: actionFilterToSpec(sel.actionFilter ?? DEFAULT_ACTION_FILTER) }
      : {}),
    // Online DAgger (15-online-dagger §5 / D1): the external policy node drives, the
    // session block carries the shell's four fields, return-to-start is a dagger
    // field too (D6) — and NEVER `dataset` (derived: online_dagger/<name>/rollouts)
    // or `policy` (that is the legacy in-process path, not reachable from here).
    ...(mode === "dagger"
      ? {
          policy_source: "external" as const,
          ...(sel.onlineDagger !== undefined
            ? { online_dagger: onlineDaggerToSpec(sel.onlineDagger) }
            : {}),
          return_to_start: sel.returnToStart ?? true,
        }
      : {}),
    // Inference (2026-09-11): the attached policy node (`policy_source: "external"`,
    // NO `policy`) or a promoted checkpoint (`policy: <id>`, no `policy_source`) —
    // never both.
    ...(mode === "inference"
      ? sel.policySource === "external"
        ? { policy_source: "external" as const }
        : sel.policyId
          ? { policy: sel.policyId }
          : {}
      : {}),
  };
}

/** The `dataset` value `buildSpec` emits for a collect selection, or null to omit it. */
export function datasetFor(sel: LandingSelection): string | null {
  if (sel.datasetMode === "existing") return sel.datasetRepoId ?? null;
  const slug = slugDataset(sel.datasetName ?? "");
  return slug === "" ? null : slug;
}
