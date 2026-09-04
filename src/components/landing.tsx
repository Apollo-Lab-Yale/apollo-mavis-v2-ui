/** Welcome-page pieces (phase-11 §4): per-tab observation grid, arm status
 * cards (with the "Searching for arms…" placeholder), Start-from option rows +
 * profile list, the read-only scene row, the FrameSelector, and the pure
 * status-caption helpers. Naming lives in ../lib/streams. */
import type { ReactNode } from "react";
import type {
  ArmStatusInfo,
  CameraInfo,
  MicrophoneInfo,
  ProfileInfo,
  SceneInfo,
  WorkcellStatus,
} from "../gen";
import {
  armLabel,
  armTitle,
  HARDWARE_CAMERA_SLOTS,
  micSubtitle,
  orderArms,
  SCENE_DISPLAY_NAME,
  SCENE_ID,
  SIM_CAMERA_SLOTS,
  streamLabel,
} from "../lib/streams";
import type { FrameRef, Kind } from "../lib/types";
import { Icon, type IconName } from "./icons";
import { MicTile } from "./MicTile";
import { StreamView } from "./StreamView";

// -- ObservationGrid -----------------------------------------------------------
// Sim: 2×2 wrist + environment cameras. Hardware: camera1, camera2 + the MicTile
// (when `/api/microphones` lists one). A slot whose camera is not `live` in
// `/api/cameras` (or is missing) renders the black `absent` tile — no WebSocket.
export interface ObservationGridProps {
  tab: Kind;
  cameras: CameraInfo[];
  /** Shown as the third Hardware tile; ignored on the Sim tab. */
  microphone: MicrophoneInfo | null;
}

export function ObservationGrid({ tab, cameras, microphone }: ObservationGridProps) {
  const slots: readonly string[] = tab === "sim" ? SIM_CAMERA_SLOTS : HARDWARE_CAMERA_SLOTS;
  const mic = tab === "hardware" ? microphone : null;
  const cells = slots.length + (mic ? 1 : 0);
  return (
    <div
      className={`obs-grid${cells === 3 ? " obs-grid-3" : ""}`}
      data-testid="camera-preview-grid"
      data-tab={tab}
    >
      {slots.map((id) => {
        const cam = cameras.find((c) => c.camera_id === id);
        return (
          <StreamView
            key={id}
            streamId={id}
            title={streamLabel(id)}
            absent={!cam?.live}
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

export function ArmStatusCard({ arm, kind }: ArmStatusCardProps) {
  const reach: Reachable = arm.reachable ?? "unknown";
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
        <span>{arm.has_rail ? "rail 0–0.65 m" : "no rail"}</span>
        <span>
          gripper {arm.gripper}
          {arm.gripper_force_capable ? " · force" : ""}
        </span>
        {arm.error_code !== 0 && <span className="pill pill-warn">err {arm.error_code}</span>}
      </div>
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

/** "No arms detected · camera1, camera2 · mic: RØDE NT-USB Mini (live)" — with
 * arms (Manipulation Arm first): "Manipulation Arm reachable, Perception Arm
 * unreachable · …"; live cameras get "(live)". */
export function hardwareCaption(
  status: WorkcellStatus | null,
  cameras: CameraInfo[],
  mic: MicrophoneInfo | null,
  configured: boolean,
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
  const micPart = mic ? `mic: ${mic.label} (${mic.status})` : "mic: none";
  return `${armsPart} · ${camPart} · ${micPart}`;
}

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
