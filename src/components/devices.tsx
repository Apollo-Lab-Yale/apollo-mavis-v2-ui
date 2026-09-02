/** Devices-page panels (13-tracker §5): gamepad, tracker, settings, session. */
import { useEffect, useRef, useState } from "react";
import type {
  PoseMsg,
  SessionInfo,
  TrackerSettingsArgs,
  TrackerSettingsMsg,
  TrackerTelemetry,
} from "../gen";
import { gamepadGlyph, keycapLabel, type Bindings } from "../input/bindings";
import { GAMEPAD_LABELS } from "../input/gamepad";
import type { GamepadState } from "../store";
import { ControllerView } from "./ControllerView";
import { TrackerTrail } from "./TrackerTrail";

const f3 = (v: number) => v.toFixed(3);

// ---------------------------------------------------------------------------
// Gamepad — secondary input since 2026-09-02 (13-tracker §1.1: the Vive
// controller supplies pose + buttons). Collapsed until a pad connects; the
// adapter keeps running regardless, so a plugged-in pad still works.

export function GamepadPanel({ pad, bindings }: { pad: GamepadState; bindings: Bindings | null }) {
  const [open, setOpen] = useState(pad.connected);
  useEffect(() => {
    if (pad.connected) setOpen(true);
  }, [pad.connected]);
  return (
    <details
      className="panel"
      data-testid="gamepad-panel"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="kv summary" data-testid="gamepad-summary">
        <strong>
          {open ? "▾" : "▸"} Gamepad <span className="dim">(optional)</span>
        </strong>
        <span>
          <span
            className={`chip ${pad.connected ? "chip-green" : "chip-grey"}`}
            data-testid="gamepad-connected"
          >
            {pad.connected ? "connected" : "no gamepad"}
          </span>{" "}
          <span
            className={`chip ${pad.armed ? "chip-blue" : "chip-grey"}`}
            data-testid="gamepad-armed"
          >
            {pad.armed ? "ARMED" : "idle"}
          </span>
        </span>
      </summary>
      <div className="kv mono dim" style={{ fontSize: 12 }}>
        <span data-testid="gamepad-id">{pad.id ?? "—"}</span>
        <span data-testid="gamepad-mapping">
          mapping: {pad.mapping === null ? "—" : pad.mapping === "" ? '"" (raw)' : pad.mapping}
        </span>
      </div>
      <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
        buttons
      </div>
      <div className="raw-grid" data-testid="gamepad-buttons">
        {pad.buttons.map((v, i) => (
          <span
            key={i}
            className={`raw-cell mono${pad.pressed[i] || v >= 0.5 ? " raw-cell-lit" : ""}`}
            data-testid={`gp-btn-${i}`}
          >
            b{i} {v.toFixed(2)}
          </span>
        ))}
      </div>
      <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
        axes
      </div>
      <div className="raw-grid" data-testid="gamepad-axes">
        {pad.axes.map((v, i) => (
          <span
            key={i}
            className={`raw-cell mono${Math.abs(v) >= 0.5 ? " raw-cell-lit" : ""}`}
            data-testid={`gp-axis-${i}`}
          >
            a{i} {v >= 0 ? "+" : ""}
            {v.toFixed(2)}
          </span>
        ))}
      </div>
      <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
        mapped actions (from the served keymap)
      </div>
      <div className="mapped-row" data-testid="gamepad-mapped">
        {GAMEPAD_LABELS.map((label) => {
          const row = bindings?.gamepad.get(label);
          const lit = pad.active.includes(label);
          return (
            <span
              key={label}
              className={`chip ${lit ? "chip-green" : "chip-grey"}`}
              data-testid={`gp-map-${label}`}
              data-lit={lit}
              title={row ? `${row.code} · ${row.label}` : "not in keymap"}
            >
              {gamepadGlyph(label)} {row ? `${row.action} (${keycapLabel(row.code)})` : "unmapped"}
            </span>
          );
        })}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Tracker

const STATUS_TONE: Record<TrackerTelemetry["status"], string> = {
  tracking: "chip-green",
  searching: "chip-amber",
  starting: "chip-amber",
  stale: "chip-amber",
  error: "chip-red",
  no_backend: "chip-grey",
};

function PoseRow({ name, pose }: { name: string; pose: PoseMsg | null | undefined }) {
  return (
    <tr data-testid={`pose-${name}`}>
      <td className="dim">{name}</td>
      {pose ? (
        <>
          <td className="mono">
            p [{f3(pose.position[0])}, {f3(pose.position[1])}, {f3(pose.position[2])}]
          </td>
          <td className="mono dim">
            q [{f3(pose.orientation[0])}, {f3(pose.orientation[1])}, {f3(pose.orientation[2])},{" "}
            {f3(pose.orientation[3])}]
          </td>
        </>
      ) : (
        <td className="dim" colSpan={2}>
          —
        </td>
      )}
    </tr>
  );
}

export interface TrackerPanelProps {
  tracker: TrackerTelemetry | null;
  /** Served keymap, used to label the controller's injected codes (§1.1). */
  bindings?: Bindings | null;
}

export function TrackerPanel({ tracker, bindings = null }: TrackerPanelProps) {
  const z = tracker?.pose_world?.position[2];
  return (
    <div className="panel" data-testid="tracker-panel">
      <div className="kv">
        <strong>Vive tracker</strong>
        <span>
          {tracker ? (
            <span
              className={`chip ${STATUS_TONE[tracker.status]}`}
              data-testid="tracker-status"
              title={tracker.detail}
            >
              {tracker.status}
            </span>
          ) : (
            <span className="chip chip-grey" data-testid="tracker-status">
              no telemetry
            </span>
          )}{" "}
          <span
            className={`chip ${tracker?.clutch ? "chip-green" : "chip-grey"}`}
            data-testid="tracker-clutch"
          >
            {tracker?.clutch
              ? `CLUTCH${tracker.engaged_arm ? ` · ${tracker.engaged_arm}` : ""}`
              : "released"}
          </span>
        </span>
      </div>
      {tracker && (
        <div className="kv mono dim" style={{ fontSize: 12 }} data-testid="tracker-device">
          <span>
            backend {tracker.backend} · {tracker.object_name ?? "?"} · seq {tracker.seq ?? "—"}
          </span>
          <span>
            {(tracker.rate_hz ?? 0).toFixed(1)} Hz · age{" "}
            {tracker.age_s == null ? "—" : `${(tracker.age_s * 1000).toFixed(0)} ms`}
          </span>
        </div>
      )}
      {tracker?.detail && (
        <div className="dim" style={{ fontSize: 12 }} data-testid="tracker-detail">
          {tracker.detail}
        </div>
      )}
      <ControllerView
        controller={tracker?.controller ?? null}
        deviceHeld={tracker?.device_held ?? []}
        bindings={bindings}
      />
      <table className="pose-table">
        <tbody>
          <PoseRow name="raw" pose={tracker?.pose_raw} />
          <PoseRow name="world" pose={tracker?.pose_world} />
          <PoseRow name="anchor" pose={tracker?.anchor_tcp} />
          <PoseRow name="target" pose={tracker?.target_tcp} />
        </tbody>
      </table>
      <div className="kv">
        <span className="dim">z (world)</span>
        <span className="mono" style={{ fontSize: 20 }} data-testid="tracker-z">
          {z == null ? "—" : `${f3(z)} m`}
        </span>
      </div>
      <TrackerTrail />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings

export interface TrackerSettingsFormProps {
  settings: TrackerSettingsMsg | null; // echoed by telemetry
  disabled: boolean;
  onChange(args: TrackerSettingsArgs): void; // → sendAction("tracker_settings", args)
}

export function TrackerSettingsForm({ settings, disabled, onChange }: TrackerSettingsFormProps) {
  const [yaw, setYaw] = useState("0");
  const [scale, setScale] = useState("1");
  const editing = useRef(new Set<string>());

  // Server-authoritative: refresh fields the operator is not editing.
  useEffect(() => {
    if (!settings) return;
    if (!editing.current.has("yaw")) setYaw(String(settings.yaw_deg));
    if (!editing.current.has("scale")) setScale(String(settings.pos_scale));
  }, [settings]);

  const sendNumber = (key: "yaw_deg" | "pos_scale", raw: string) => {
    const v = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(v)) return;
    if (key === "pos_scale" && (v < 0.1 || v > 3)) return; // TrackerSettingsArgs bounds
    onChange({ [key]: v });
  };

  return (
    <div className="panel" data-testid="tracker-settings">
      <strong>Tracker settings</strong>
      <label className="kv">
        <span>yaw_deg</span>
        <input
          type="number"
          step={1}
          value={yaw}
          disabled={disabled}
          data-testid="tracker-yaw"
          onFocus={() => editing.current.add("yaw")}
          onBlur={() => editing.current.delete("yaw")}
          onChange={(e) => {
            setYaw(e.target.value);
            sendNumber("yaw_deg", e.target.value);
          }}
        />
      </label>
      <label className="kv">
        <span>pos_scale (0.1–3)</span>
        <input
          type="number"
          step={0.1}
          min={0.1}
          max={3}
          value={scale}
          disabled={disabled}
          data-testid="tracker-scale"
          onFocus={() => editing.current.add("scale")}
          onBlur={() => editing.current.delete("scale")}
          onChange={(e) => {
            setScale(e.target.value);
            sendNumber("pos_scale", e.target.value);
          }}
        />
      </label>
      <label className="kv">
        <span>follow_rotation</span>
        <input
          type="checkbox"
          checked={settings?.follow_rotation ?? true}
          disabled={disabled}
          data-testid="tracker-follow-rotation"
          onChange={(e) => onChange({ follow_rotation: e.target.checked })}
        />
      </label>
      <div className="mono dim" style={{ fontSize: 12 }} data-testid="tracker-settings-echo">
        {settings
          ? `live: yaw ${settings.yaw_deg}° · scale ${settings.pos_scale} · rotation ${
              settings.follow_rotation ? "on" : "off"
            }`
          : "live: — (no telemetry)"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session

export interface SessionControlsProps {
  session: SessionInfo | null;
  scene: string | null; // known only when started from this page
  busy: boolean;
  onStart(): void;
  onStop(): void;
}

export function SessionControls({ session, scene, busy, onStart, onStop }: SessionControlsProps) {
  return (
    <div className="panel" data-testid="session-controls">
      <div className="kv">
        <strong>Session</strong>
        {session ? (
          <button onClick={onStop} disabled={busy} data-testid="session-stop">
            Stop session
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={onStart}
            disabled={busy}
            data-testid="session-start"
          >
            Start teleop · sim · mavis_v2
          </button>
        )}
      </div>
      {session ? (
        <div className="mono dim" style={{ fontSize: 12 }} data-testid="session-summary">
          {session.mode} · {scene ?? "scene ?"} · arms {session.arms.join(", ")} · {session.state}
        </div>
      ) : (
        <div className="dim" style={{ fontSize: 12 }}>
          No session — device panels still work; streams need a session.
        </div>
      )}
    </div>
  );
}
