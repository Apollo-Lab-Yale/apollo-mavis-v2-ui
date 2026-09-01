/** Landing-page pieces: kind toggle, camera grid, arm cards, pickers (05-ui §8.1, §9). */
import type { ArmStatusInfo, CameraInfo, ProfileInfo, SceneInfo } from "../gen";
import type { FrameRef, Kind } from "../lib/types";
import { StreamView } from "./StreamView";

// -- WorkcellKindToggle ---------------------------------------------------------
export interface WorkcellKindToggleProps {
  kind: Kind;
  available: Kind[];
  onChange(k: Kind): void;
}

export function WorkcellKindToggle({ kind, available, onChange }: WorkcellKindToggleProps) {
  return (
    <div className="panel" data-testid="kind-toggle">
      <span className="dim">Workcell&nbsp;</span>
      {(["hardware", "sim"] as const).map((k) => {
        const supported = available.includes(k);
        return (
          <button
            key={k}
            className={k === kind ? "btn-primary" : ""}
            disabled={!supported}
            title={supported ? undefined : `runtime config does not support ${k}`}
            onClick={() => onChange(k)}
            data-testid={`kind-${k}`}
          >
            {k}
          </button>
        );
      })}
    </div>
  );
}

// -- CameraPreviewGrid — always renders 4 slots ---------------------------------
export interface CameraPreviewGridProps {
  cameras: CameraInfo[];
}

export function CameraPreviewGrid({ cameras }: CameraPreviewGridProps) {
  const slots: (CameraInfo | null)[] = Array.from({ length: 4 }, (_, i) => cameras[i] ?? null);
  return (
    <div className="stream-grid" data-testid="camera-preview-grid">
      {slots.map((cam, i) =>
        cam && cam.live ? (
          <StreamView
            key={cam.camera_id}
            streamId={cam.camera_id}
            label={cam.label}
            showLatencyBadge={false}
          />
        ) : (
          <div className="tile" key={`empty-${i}`}>
            <div className="tile-empty" data-testid={`camera-slot-empty-${i}`}>
              {cam ? `${cam.label} (offline)` : "No camera"}
            </div>
          </div>
        ),
      )}
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
      aria-label={`recording frame for ${armId}`}
      data-testid={`frame-selector-${armId}`}
    >
      <option value={`arm_base:${armId}`}>arm_base ({armId})</option>
      <option value="world">world</option>
      {cameras.map((c) => (
        <option key={c.camera_id} value={`camera:${c.camera_id}`}>
          camera: {c.label}
        </option>
      ))}
    </select>
  );
}

// -- ArmStatusCard ---------------------------------------------------------------
export interface ArmStatusCardProps {
  arm: ArmStatusInfo;
  included: boolean;
  onIncludeChange(v: boolean): void;
  frame: FrameRef;
  onFrameChange(f: FrameRef): void;
  cameras: CameraInfo[];
}

export function ArmStatusCard({
  arm,
  included,
  onIncludeChange,
  frame,
  onFrameChange,
  cameras,
}: ArmStatusCardProps) {
  return (
    <div className="panel" data-testid={`arm-card-${arm.arm_id}`}>
      <div className="kv">
        <strong>{arm.arm_id}</strong>
        <span className={`chip ${arm.connected ? "chip-green" : "chip-red"}`}>
          {arm.connected ? "connected" : "offline"}
        </span>
      </div>
      <div className="kv dim mono">
        <span>{arm.ip ?? "no ip"}</span>
        <span>{arm.has_rail ? "rail 0–0.65 m" : "no rail"}</span>
      </div>
      <div className="kv dim">
        <span>
          gripper: {arm.gripper}
          {arm.gripper_force_capable && <span className="chip chip-grey"> force</span>}
        </span>
        {arm.error_code !== 0 && <span className="chip chip-amber">err {arm.error_code}</span>}
      </div>
      <label className="kv">
        <span>Include in session</span>
        <input
          type="checkbox"
          checked={included}
          onChange={(e) => onIncludeChange(e.target.checked)}
          data-testid={`include-${arm.arm_id}`}
        />
      </label>
      {included && (
        <label className="kv">
          <span>Recording frame</span>
          <FrameSelector
            armId={arm.arm_id}
            value={frame}
            cameras={cameras}
            onChange={onFrameChange}
          />
        </label>
      )}
    </div>
  );
}

// -- ScenePicker -------------------------------------------------------------------
export interface ScenePickerProps {
  kind: "sim" | "twin";
  scenes: SceneInfo[];
  requiredArms: number;
  value: string | null;
  onChange(id: string): void;
}

export function ScenePicker({ kind, scenes, requiredArms, value, onChange }: ScenePickerProps) {
  return (
    <div className="panel" data-testid={`scene-picker-${kind}`}>
      <div className="dim">{kind === "twin" ? "Digital-twin scene (required)" : "Sim scene"}</div>
      {scenes.length === 0 && <div className="dim">No scenes available</div>}
      {scenes.map((s) => {
        const mismatch = requiredArms > 0 && s.num_arms !== requiredArms;
        return (
          <label className="kv" key={s.scene_id}>
            <span>
              <input
                type="radio"
                name={`scene-${kind}`}
                checked={value === s.scene_id}
                disabled={mismatch}
                onChange={() => onChange(s.scene_id)}
                data-testid={`scene-${s.scene_id}`}
              />{" "}
              {s.label}
            </span>
            <span className="dim mono">
              {s.num_arms} arm{s.num_arms === 1 ? "" : "s"} · rails [
              {s.rail_flags.map((f) => (f ? "R" : "-")).join("")}]
              {mismatch && " — arm count mismatch"}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// -- ProfilePicker + StartFromChoice --------------------------------------------
export interface ProfilePickerProps {
  profiles: ProfileInfo[];
  selectedArms: string[];
  startFrom: "keep_current" | "profile";
  onStartFromChange(v: "keep_current" | "profile"): void;
  value: string | null;
  onChange(id: string | null): void;
}

export function ProfilePicker({
  profiles,
  selectedArms,
  startFrom,
  onStartFromChange,
  value,
  onChange,
}: ProfilePickerProps) {
  return (
    <div className="panel" data-testid="profile-picker">
      <div className="dim">Start from</div>
      <label className="kv">
        <span>Keep current state</span>
        <input
          type="radio"
          name="start-from"
          checked={startFrom === "keep_current"}
          onChange={() => onStartFromChange("keep_current")}
          data-testid="start-keep-current"
        />
      </label>
      <label className="kv">
        <span>Load selected profile</span>
        <input
          type="radio"
          name="start-from"
          checked={startFrom === "profile"}
          onChange={() => onStartFromChange("profile")}
          data-testid="start-profile"
        />
      </label>
      {startFrom === "profile" &&
        profiles.map((p) => {
          const uncovered = p.arms.some((a) => !selectedArms.includes(a));
          return (
            <label className="kv" key={p.profile_id}>
              <span>
                <input
                  type="radio"
                  name="profile"
                  checked={value === p.profile_id}
                  disabled={uncovered}
                  onChange={() => onChange(p.profile_id)}
                  data-testid={`profile-${p.profile_id}`}
                />{" "}
                {p.name}
                {p.is_initial_condition && (
                  <span className="chip chip-green" data-testid={`initial-badge-${p.profile_id}`}>
                    initial condition
                  </span>
                )}
              </span>
              <span className="dim mono">
                [{p.arms.join(", ")}] {p.notes}
              </span>
            </label>
          );
        })}
    </div>
  );
}
