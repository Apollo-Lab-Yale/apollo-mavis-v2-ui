/** Welcome-page pieces (phase-11 §4): per-tab observation grid, arm status
 * cards (with the "Searching for arms…" placeholder; on the Hardware tab also
 * the phase-09b safety read-back line + Clear errors / Apply safety settings
 * buttons, and — phase-09c — the rail read-back pill, the **Home rail** button
 * opening the `HomeRailSheet`, and the session-eligibility line — phase-09d:
 * every hardware arm joins the session, the "Include in session" switch is
 * gone), Start-from option rows + profile list, the read-only scene row, the
 * FrameSelector, and the pure status-caption helpers. Naming lives in
 * ../lib/streams, the maintenance copy/enablement in ../lib/maintenance. */
import { useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { postArmMaintenance } from "../api/rest";
import type {
  ArmMonitorTelemetry,
  ArmStatusInfo,
  CameraInfo,
  HardwareMonitorTelemetry,
  MicrophoneInfo,
  ProfileInfo,
  SceneInfo,
  WorkcellStatus,
} from "../gen";
import {
  armLabel,
  armTitle,
  HARDWARE_CAMERA_SLOTS,
  HARDWARE_GRID_SLOTS,
  isOverlayStream,
  micSubtitle,
  orderArms,
  SCENE_DISPLAY_NAME,
  SCENE_ID,
  SIM_CAMERA_SLOTS,
  streamLabel,
} from "../lib/streams";
import {
  maintenanceErrorText,
  maintenanceToast,
  maintenanceView,
  TITLE_DIFFERS,
  type MaintenanceOp,
  type MaintenanceView,
} from "../lib/maintenance";
import type { FrameRef, Kind } from "../lib/types";
import { useDelayedUnmount } from "../lib/useDelayedUnmount";
import { selectMaintenanceBusy, selectMonitorArm, useStore, type AppState } from "../store";
import { HomeRailSheet } from "./HomeRailSheet";
import { Icon, type IconName } from "./icons";
import { MicTile } from "./MicTile";
import { SHEET_EXIT_MS } from "./Sheet";
import { StreamView } from "./StreamView";

// -- ObservationGrid -----------------------------------------------------------
// Sim: 2×2 wrist + environment cameras. Hardware (phase-09a): five cells —
// grip_wrist, grip_wrist_align, view_wrist, view_wrist_align (HARDWARE_GRID_SLOTS)
// + the MicTile (when `/api/microphones` lists one); `obs-grid-5` lays them out
// as real cameras | twin overlays | microphone spanning both rows. A slot whose
// camera is not `live` in `/api/cameras` (or is missing) renders the black
// `absent` tile — no WebSocket. Overlay tiles show their
// `telemetry.hardware_monitor.overlays` `detail` as a bottom-edge note.
export interface ObservationGridProps {
  tab: Kind;
  cameras: CameraInfo[];
  /** Shown as the fifth Hardware tile; ignored on the Sim tab. */
  microphone: MicrophoneInfo | null;
}

/** Bottom-edge note of a twin-overlay tile: the stream's `detail` from
 * `telemetry.hardware_monitor.overlays` (e.g. "monitor stale"), with the
 * wire's separators shown as middle dots — the runtime joins parts with "; "
 * and writes " - " inside a part, so "monitor stale: no fresh sample for 1.2 s;
 * rail not homed - twin assumes 0.65 m" renders as "monitor stale: no fresh
 * sample for 1.2 s · rail not homed · twin assumes 0.65 m" (":" stays: it binds
 * a label to its value). "" when the block, the stream or the detail is absent
 * (→ no note). */
export function overlayNote(
  monitor: HardwareMonitorTelemetry | null | undefined,
  streamId: string,
): string {
  const detail = monitor?.overlays?.find((o) => o.stream_id === streamId)?.detail ?? "";
  return detail.replace(/ - /g, " · ").replace(/; /g, " · ");
}

/** A twin-overlay slot: a plain StreamView (`live: false` → black `absent`, no
 * WebSocket) whose note is subscribed here as a string, so only this tile
 * re-renders on a telemetry tick and only when the detail text changes. */
function OverlayTile({ id, live }: { id: string; live: boolean }) {
  const note = useStore((s) => overlayNote(s.telemetry?.hardware_monitor, id));
  return (
    <StreamView
      streamId={id}
      title={streamLabel(id)}
      absent={!live}
      showLatencyBadge={false}
      note={note || undefined}
    />
  );
}

export function ObservationGrid({ tab, cameras, microphone }: ObservationGridProps) {
  const slots: readonly string[] = tab === "sim" ? SIM_CAMERA_SLOTS : HARDWARE_GRID_SLOTS;
  const mic = tab === "hardware" ? microphone : null;
  const cells = slots.length + (mic ? 1 : 0);
  return (
    <div className={`obs-grid obs-grid-${cells}`} data-testid="camera-preview-grid" data-tab={tab}>
      {slots.map((id) => {
        const live = cameras.find((c) => c.camera_id === id)?.live ?? false;
        return isOverlayStream(id) ? (
          <OverlayTile key={id} id={id} live={live} />
        ) : (
          <StreamView
            key={id}
            streamId={id}
            title={streamLabel(id)}
            absent={!live}
            showLatencyBadge={false}
          />
        );
      })}
      {mic && <MicTile info={mic} micId={mic.mic_id} subtitle={micSubtitle(mic)} />}
    </div>
  );
}

// -- FrameSelector — serializes arm_base:<id> / world / camera:<id> -------------
export interface FrameSelectorProps {
  armId: string;
  value: FrameRef;
  cameras: CameraInfo[];
  onChange(f: FrameRef): void;
}

export function FrameSelector({ armId, value, cameras, onChange }: FrameSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`recording frame for ${armTitle(armId)}`}
      data-testid={`frame-selector-${armId}`}
    >
      <option value={`arm_base:${armId}`}>arm_base · {armTitle(armId)}</option>
      <option value="world">world</option>
      {cameras.map((c) => (
        <option key={c.camera_id} value={`camera:${c.camera_id}`}>
          camera: {streamLabel(c.camera_id)}
        </option>
      ))}
    </select>
  );
}

// -- Arm status ------------------------------------------------------------------
export type Reachable = NonNullable<ArmStatusInfo["reachable"]>;

export const REACHABLE_TEXT: Readonly<Record<Reachable, string>> = {
  open: "Reachable",
  refused: "Control box starting",
  unreachable: "Unreachable",
  unknown: "Probing…",
};
const REACHABLE_PILL: Readonly<Record<Reachable, string>> = {
  open: "pill pill-ok",
  refused: "pill pill-warn",
  unreachable: "pill pill-danger",
  unknown: "pill",
};

/** "Real arms detected": a session holds the arm, or the :502 probe answered. */
export const armDetected = (a: ArmStatusInfo): boolean => a.connected || a.reachable === "open";

export interface ArmStatusCardProps {
  arm: ArmStatusInfo;
  kind: Kind;
}

/** Hardware cards only (phase-09b): the read-only monitor's row for this arm
 * + the "a hardware session owns the boxes" flag, reduced to primitives by
 * `maintenanceView` so `useShallow` re-renders the card only when the strip
 * changes (the monitor block is a fresh object on every telemetry tick).
 * Phase-09d: the monitor's `paused` flag is ALSO set while a `RailHomingJob`'s
 * driver owns a control box (no session, `maintenance_busy` on that arm), so
 * "session" = a hardware `SessionInfo`, or `paused` with no maintenance op
 * running anywhere; `paused` + an op running = a homing in progress. */
const selectMaintenance =
  (arm: ArmStatusInfo, kind: Kind) =>
  (s: AppState): MaintenanceView | null => {
    if (kind !== "hardware") return null;
    const homing = selectMaintenanceBusy(s);
    const paused = s.telemetry?.hardware_monitor?.paused === true;
    const sessionActive = s.session?.kind === "hardware" || (paused && !homing);
    return maintenanceView(
      selectMonitorArm(arm.arm_id)(s),
      arm,
      sessionActive,
      homing && !sessionActive,
    );
  };

export function ArmStatusCard({ arm, kind }: ArmStatusCardProps) {
  const reach: Reachable = arm.reachable ?? "unknown";
  const maintenance = useStore(useShallow(selectMaintenance(arm, kind)));
  let pill: ReactNode;
  if (arm.connected) {
    pill = (
      <span className="pill pill-ok" data-testid={`arm-state-${arm.arm_id}`}>
        <span className="status-dot" aria-hidden="true" />
        Connected
      </span>
    );
  } else if (kind === "sim") {
    pill = (
      <span className="pill pill-accent" data-testid={`arm-state-${arm.arm_id}`}>
        <span className="status-dot" aria-hidden="true" />
        Simulated
      </span>
    );
  } else {
    pill = (
      <span className={REACHABLE_PILL[reach]} data-testid={`arm-state-${arm.arm_id}`}>
        {reach === "unknown" ? (
          <span className="spinner" aria-hidden="true" />
        ) : (
          <span className="status-dot" aria-hidden="true" />
        )}
        {REACHABLE_TEXT[reach]}
      </span>
    );
  }
  return (
    <div
      className="card arm-card"
      data-testid={`arm-card-${arm.arm_id}`}
      data-reachable={kind === "hardware" ? reach : undefined}
    >
      <div className="arm-card-head">
        <span className="arm-card-title">
          <span className="text-title-3">{armLabel(arm.arm_id)}</span>
          <span className="chip chip-id" data-testid={`arm-id-${arm.arm_id}`}>
            {arm.arm_id}
          </span>
        </span>
        {pill}
      </div>
      <div className="arm-card-meta text-mono">
        <span>{arm.ip ?? (kind === "sim" ? "simulated" : "no ip")}</span>
        {maintenance?.rail === "unhomed" ? (
          <span
            className="pill pill-warn arm-card-rail"
            data-testid={`arm-rail-${arm.arm_id}`}
            data-rail="unhomed"
          >
            <Icon name="warning" size={12} />
            {maintenance.railLabel}
          </span>
        ) : (
          <span data-testid={`arm-rail-${arm.arm_id}`} data-rail={maintenance?.rail ?? "unknown"}>
            {maintenance ? maintenance.railLabel : arm.has_rail ? "rail 0–0.65 m" : "no rail"}
          </span>
        )}
        <span>
          gripper {arm.gripper}
          {arm.gripper_force_capable ? " · force" : ""}
        </span>
        {maintenance?.meta && (
          <span
            className={`arm-card-safety${maintenance.mismatch ? " is-mismatch" : ""}`}
            data-testid={`arm-safety-${arm.arm_id}`}
            data-mismatch={maintenance.mismatch ? "true" : "false"}
            title={maintenance.mismatch ? TITLE_DIFFERS : undefined}
          >
            {maintenance.mismatch && <Icon name="warning" size={12} />}
            {maintenance.meta}
          </span>
        )}
        {arm.error_code !== 0 && (
          <span
            className="chip chip-red"
            data-testid={`arm-error-${arm.arm_id}`}
            title={`controller error ${arm.error_code}`}
          >
            C{arm.error_code}
          </span>
        )}
      </div>
      {maintenance && <ArmMaintenanceActions armId={arm.arm_id} view={maintenance} />}
      {maintenance?.sessionReason && (
        <div
          className="arm-card-session-reason text-callout"
          data-testid={`arm-session-reason-${arm.arm_id}`}
          data-gate={maintenance.gate}
        >
          <Icon name="info" size={12} />
          <span>
            <span className="fg-3">Not ready for a session — </span>
            {maintenance.sessionReason}
          </span>
        </div>
      )}
    </div>
  );
}

// -- Arm maintenance buttons (Hardware tab, phase-09b/09c) -----------------------------
// Session-less controller ops. Two are hygiene without motion, hence no
// confirm dialog: **Clear errors** (`clean_error` + `clean_warn`, never
// `motion_enable`) while the controller reports an error or warning, and
// **Apply safety settings** (`apply_backstops`: payload, collision
// sensitivity, self-collision model, rebound off) while the read-back differs
// from the arm's config. The third, **Home rail** (phase-09c), is the ONE op
// that moves hardware: shown while the monitor sees a track that is not
// (homed AND enabled), enabled with no session / no op running / `error_code
// == 0`, and it does NOT post directly — it opens the `HomeRailSheet`, which
// runs the twin sweep (dry run) first and asks for a destructive confirm.
// All are disabled with the visible reason "Use the Cockpit" while a hardware
// session owns the boxes (the runtime answers 409 / routes to the session
// driver), and with "Rail homing in progress — wait for it to finish" while a
// RailHomingJob / homing runs on the OTHER arm (409 "rail homing in progress";
// the homing arm's own card shows the shared indicator). One POST at a time per card; ONLY the pressed button shows a
// spinner and `aria-busy` until the result toast (the sheet's real homing POST
// marks Home rail busy through `onHomingChange`). An op started by another
// client (`maintenance_busy` with nothing pending here) disables every button
// and shows one shared "maintenance running…" indicator instead of marking a
// button busy (only one op can run on an arm).
interface ArmMaintenanceActionsProps {
  armId: string;
  view: MaintenanceView;
}

const OP_LABEL: Readonly<Record<Exclude<MaintenanceOp, "recover">, string>> = {
  clear_errors: "Clear errors",
  apply_backstops: "Apply safety settings",
  home_rail: "Home rail",
};

function ArmMaintenanceActions({ armId, view }: ArmMaintenanceActionsProps) {
  const addToast = useStore((s) => s.addToast);
  const [pending, setPending] = useState<MaintenanceOp | null>(null);
  const [homeRail, setHomeRail] = useState(false);
  const homeRailMounted = useDelayedUnmount(homeRail, SHEET_EXIT_MS);
  const run = async (op: MaintenanceOp) => {
    if (pending !== null) return;
    setPending(op);
    try {
      const { text, tone } = maintenanceToast(await postArmMaintenance(armId, op));
      addToast(text, tone);
    } catch (e) {
      addToast(maintenanceErrorText(armId, e), "error");
    } finally {
      setPending(null);
    }
  };
  const serverBusy = view.busy && pending === null; // another client's op is running
  const button = (op: Exclude<MaintenanceOp, "recover">, enabled: boolean, testId: string) => {
    const busy = pending === op;
    return (
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={!enabled || pending !== null}
        aria-busy={busy ? "true" : undefined}
        data-testid={testId}
        title={view.reason ?? undefined}
        onClick={() => void run(op)}
      >
        {busy && <span className="spinner" aria-hidden="true" />}
        {OP_LABEL[op]}
      </button>
    );
  };
  const homing = pending === "home_rail";
  return (
    <div className="arm-card-actions" data-testid={`arm-actions-${armId}`}>
      {button("clear_errors", view.clearEnabled, `arm-clear-errors-${armId}`)}
      {button("apply_backstops", view.applyEnabled, `arm-apply-backstops-${armId}`)}
      {view.homeRailShown && (
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={!view.homeRailEnabled || pending !== null}
          aria-busy={homing ? "true" : undefined}
          data-testid={`arm-home-rail-${armId}`}
          title={view.homeRailReason ?? view.reason ?? undefined}
          onClick={() => setHomeRail(true)}
        >
          {homing && <span className="spinner" aria-hidden="true" />}
          {OP_LABEL.home_rail}
        </button>
      )}
      {serverBusy && (
        <span className="btn-reason" data-testid={`arm-actions-busy-${armId}`} role="status">
          <span className="spinner" aria-hidden="true" /> maintenance running…
        </span>
      )}
      {view.reason && (
        <span className="btn-reason" data-testid={`arm-actions-reason-${armId}`}>
          {view.reason}
        </span>
      )}
      {view.homeRailReason && (
        <span className="btn-reason" data-testid={`arm-home-rail-reason-${armId}`}>
          {view.homeRailReason}
        </span>
      )}
      {homeRailMounted && (
        <HomeRailSheet
          armId={armId}
          open={homeRail}
          onRequestClose={() => setHomeRail(false)}
          onHomingChange={(inFlight) => setPending(inFlight ? "home_rail" : null)}
        />
      )}
    </div>
  );
}

export interface ArmCardsProps {
  kind: Kind;
  arms: ArmStatusInfo[];
  /** Hardware only: the runtime config has a hardware workcell block. */
  configured: boolean;
}

/** One card per arm once arms are detected — Manipulation Arm first
 * (`orderArms`) — otherwise a single placeholder: "Searching for arms…" (the
 * 2 s probe keeps polling) or the configuration hint. */
export function ArmCards({ kind, arms: unordered, configured }: ArmCardsProps) {
  const arms = orderArms(unordered, (a) => a.arm_id);
  const detected = kind === "sim" ? arms.length > 0 : arms.some(armDetected);
  if (!detected) {
    const searching = kind === "sim" || configured;
    return (
      <div className="arm-cards" data-testid="arm-cards">
        <div
          className="card arm-card arm-card-placeholder"
          data-testid="arm-card-placeholder"
          role="status"
          aria-live="polite"
        >
          {searching ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <Icon name="info" size={18} />
          )}
          <span className="text-body-strong">
            {searching ? "Searching for arms…" : "Hardware workcell not configured"}
          </span>
          {searching && arms.length > 0 && (
            <span className="text-caption fg-3 tabular">
              {arms
                .map(
                  (a) =>
                    `${armTitle(a.arm_id)}${a.ip ? ` ${a.ip}` : ""} · ${REACHABLE_TEXT[a.reachable ?? "unknown"].toLowerCase()}`,
                )
                .join("  ·  ")}
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="arm-cards" data-testid="arm-cards">
      {arms.map((a) => (
        <ArmStatusCard key={a.arm_id} arm={a} kind={kind} />
      ))}
    </div>
  );
}

// -- Status captions (pure) --------------------------------------------------------
/** "APOLLO MAVIS V2 Digital Twin · 2 arms on rails" */
export function simCaption(scene: SceneInfo | null): string {
  const n = scene?.num_arms ?? 2;
  const rails = scene ? scene.rail_flags.length > 0 && scene.rail_flags.every(Boolean) : true;
  return `${SCENE_DISPLAY_NAME} · ${n} arm${n === 1 ? "" : "s"}${rails ? " on rails" : ""}`;
}

/** One arm of the read-only monitor for the caption: its `status`, or
 * "error C<code>" when the controller reports an error (`error_code != 0`). */
export const armMonitorText = (a: ArmMonitorTelemetry): string =>
  (a.error_code ?? 0) !== 0 ? `error C${a.error_code}` : (a.status ?? "off");

/** "twin: Manipulation Arm running, Perception Arm error C19" — the read-only
 * hardware monitor's per-arm state (`hardware_monitor.arms`, Manipulation Arm
 * first; `paused` arms read "paused"). The runtime lists every configured
 * hardware arm even when the monitor is inert (`enabled: false`, hardware
 * package missing), each with `status: "off"` → "twin: Manipulation Arm off,
 * Perception Arm off"; "twin: off" only when the block lists no arm at all
 * (no hardware workcell configured). */
export function twinCaption(monitor: HardwareMonitorTelemetry): string {
  const arms = orderArms(monitor.arms ?? [], (a) => a.arm_id);
  if (arms.length === 0) return "twin: off";
  return `twin: ${arms.map((a) => `${armLabel(a.arm_id)} ${armMonitorText(a)}`).join(", ")}`;
}

/** "No arms detected · grip_wrist, view_wrist · mic: RØDE NT-USB Mini (live)" — with
 * arms (Manipulation Arm first): "Manipulation Arm reachable, Perception Arm
 * unreachable · …"; live cameras get "(live)". With a `telemetry.hardware_monitor`
 * block the twin segment follows the cameras: "… · grip_wrist (live), view_wrist
 * (live) · twin: Manipulation Arm running, Perception Arm error C19 · mic: …"
 * (omitted while no telemetry / an older runtime). */
export function hardwareCaption(
  status: WorkcellStatus | null,
  cameras: CameraInfo[],
  mic: MicrophoneInfo | null,
  configured: boolean,
  monitor: HardwareMonitorTelemetry | null = null,
): string {
  return hardwareCaptionWithTwin(
    status,
    cameras,
    mic,
    configured,
    monitor ? twinCaption(monitor) : null,
  );
}

/** `hardwareCaption` with the twin segment already rendered (`twin` = the
 * `twinCaption` string, or null to omit the segment) — what `HardwareCaption`
 * subscribes to, so a telemetry tick re-renders it only when that text changes. */
export function hardwareCaptionWithTwin(
  status: WorkcellStatus | null,
  cameras: CameraInfo[],
  mic: MicrophoneInfo | null,
  configured: boolean,
  twin: string | null,
): string {
  const arms = orderArms(status?.arms ?? [], (a) => a.arm_id);
  let armsPart: string;
  if (!configured) armsPart = "Hardware workcell not configured";
  else if (!arms.some(armDetected)) armsPart = "No arms detected";
  else
    armsPart = arms
      .map(
        (a) =>
          `${armLabel(a.arm_id)} ${(a.connected ? "connected" : REACHABLE_TEXT[a.reachable ?? "unknown"]).toLowerCase()}`,
      )
      .join(", ");
  const camPart = HARDWARE_CAMERA_SLOTS.map((id) =>
    cameras.find((c) => c.camera_id === id)?.live ? `${id} (live)` : id,
  ).join(", ");
  const twinPart = twin ? ` · ${twin}` : "";
  const micPart = mic ? `mic: ${mic.label} (${mic.status})` : "mic: none";
  return `${armsPart} · ${camPart}${twinPart} · ${micPart}`;
}

export interface HardwareCaptionProps {
  status: WorkcellStatus | null;
  cameras: CameraInfo[];
  mic: MicrophoneInfo | null;
  configured: boolean;
}

/** `hardwareCaption` with the twin segment from the store's telemetry. The
 * subscription is the derived `twinCaption` STRING (like `OverlayTile`'s note),
 * not the `hardware_monitor` object — that is a fresh reference on every
 * telemetry tick — so this text re-renders only when the segment changes. */
export function HardwareCaption({ status, cameras, mic, configured }: HardwareCaptionProps) {
  const twin = useStore(selectTwinCaption);
  return <>{hardwareCaptionWithTwin(status, cameras, mic, configured, twin)}</>;
}

const selectTwinCaption = (s: {
  telemetry: { hardware_monitor?: HardwareMonitorTelemetry | null } | null;
}) => (s.telemetry?.hardware_monitor ? twinCaption(s.telemetry.hardware_monitor) : null);

// -- SceneSummary (read-only; other registry scenes are filtered client-side) -------
export interface SceneSummaryProps {
  kind: "sim" | "twin";
  /** The mavis_v2 row from `/api/scenes`, or null when the registry lacks it. */
  scene: SceneInfo | null;
}

export function SceneSummary({ kind, scene }: SceneSummaryProps) {
  const rails =
    scene && scene.rail_flags.length > 0 && scene.rail_flags.every(Boolean)
      ? "rails"
      : scene
        ? `rails [${scene.rail_flags.map((f) => (f ? "R" : "-")).join("")}]`
        : null;
  return (
    <div
      className="scene-row"
      data-testid={`scene-picker-${kind}`}
      data-scene-id={scene ? SCENE_ID : undefined}
    >
      <Icon name="lock" size={18} className="scene-row-icon" />
      <span className="scene-row-text">
        <span className="fg-3">Scene</span>
        <span className="scene-row-sep" aria-hidden="true">
          ·
        </span>
        <strong data-testid={`scene-${SCENE_ID}`}>{SCENE_DISPLAY_NAME}</strong>
        {scene ? (
          <>
            <span className="scene-row-sep" aria-hidden="true">
              ·
            </span>
            <span className="fg-2">
              {scene.num_arms} arm{scene.num_arms === 1 ? "" : "s"} · {rails} ·{" "}
              {scene.cameras.length} camera{scene.cameras.length === 1 ? "" : "s"}
            </span>
          </>
        ) : (
          <>
            <span className="scene-row-sep" aria-hidden="true">
              ·
            </span>
            <span className="pill pill-warn" data-testid="scene-unavailable">
              <Icon name="warning" size={12} />
              unavailable
            </span>
          </>
        )}
      </span>
    </div>
  );
}

// -- Start from: two option rows + the profile list -------------------------------------
export type StartFromChoice = "keep_current" | "profile";

export interface StartFromProps {
  profiles: ProfileInfo[];
  /** Arm ids of the current tab's workcell — profiles covering other arms are disabled. */
  arms: string[];
  startFrom: StartFromChoice;
  onStartFromChange(v: StartFromChoice): void;
  profileId: string | null;
  onProfileChange(id: string | null): void;
}

interface OptionRowProps {
  selected: boolean;
  icon: IconName;
  title: string;
  help: string;
  name: string;
  testId: string;
  onSelect(): void;
}

function OptionRow({ selected, icon, title, help, name, testId, onSelect }: OptionRowProps) {
  return (
    <label className="option-row" data-selected={selected ? "true" : "false"}>
      <input
        type="radio"
        name={name}
        className="visually-hidden"
        checked={selected}
        onChange={onSelect}
        data-testid={testId}
      />
      <Icon name={icon} size={22} className="option-icon" />
      <span className="option-text">
        <span className="option-title">{title}</span>
        <span className="option-help">{help}</span>
      </span>
      <span className="option-radio" aria-hidden="true" />
    </label>
  );
}

export function StartFrom({
  profiles,
  arms,
  startFrom,
  onStartFromChange,
  profileId,
  onProfileChange,
}: StartFromProps) {
  return (
    <div className="option-rows" data-testid="profile-picker">
      <div role="radiogroup" aria-label="Start from" className="option-rows">
        <OptionRow
          selected={startFrom === "keep_current"}
          icon="target"
          title="Keep current state"
          help="Arms stay exactly where they are"
          name="start-from"
          testId="start-keep-current"
          onSelect={() => onStartFromChange("keep_current")}
        />
        <OptionRow
          selected={startFrom === "profile"}
          icon="bookmark"
          title="Load a profile"
          help="Twin-planned safe motion to a saved pose"
          name="start-from"
          testId="start-profile"
          onSelect={() => onStartFromChange("profile")}
        />
      </div>
      {startFrom === "profile" && (
        <div
          className="profile-list pane-enter"
          role="radiogroup"
          aria-label="Profile"
          data-testid="profile-list"
        >
          {profiles.length === 0 && (
            <div className="profile-empty" data-testid="profile-empty">
              No saved profiles — save one from Teleop
            </div>
          )}
          {profiles.map((p) => {
            const missing = p.arms.filter((a) => !arms.includes(a));
            const disabled = missing.length > 0;
            const selected = profileId === p.profile_id;
            return (
              <label
                key={p.profile_id}
                className={`profile-row${selected ? " is-selected" : ""}`}
                aria-disabled={disabled ? "true" : undefined}
                data-testid={`profile-row-${p.profile_id}`}
              >
                <input
                  type="radio"
                  name="profile"
                  className="visually-hidden"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onProfileChange(p.profile_id)}
                  data-testid={`profile-${p.profile_id}`}
                />
                <span className="profile-main">
                  <span className="text-body-strong">{p.name}</span>
                  <span className="profile-arms">
                    {orderArms(p.arms, (a) => a).map((a) => (
                      <span key={a} className="chip chip-grey" title={a}>
                        {armLabel(a)}
                      </span>
                    ))}
                  </span>
                  {p.is_initial_condition && (
                    <span className="pill pill-ok" data-testid={`initial-badge-${p.profile_id}`}>
                      <Icon name="bookmark" size={12} />
                      Initial condition
                    </span>
                  )}
                </span>
                {(disabled || p.notes) && (
                  <span className="profile-notes text-callout">
                    {disabled
                      ? `covers ${missing.map(armLabel).join(", ")} — not in this workcell`
                      : p.notes}
                  </span>
                )}
                <Icon name="check" size={18} className="profile-check" />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
