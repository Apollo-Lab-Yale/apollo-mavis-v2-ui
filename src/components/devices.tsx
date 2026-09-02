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
          {pad.latched && (
            <>
              {" "}
              <span
                className="chip chip-amber"
                data-testid="gamepad-latched"
                title="release-all latched (blur / hidden / link down): release every control to resume"
              >
                LATCHED
              </span>
            </>
          )}
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
  // Prefer the filtered pose (what the anchor/delta math consumes, §4).
  const z = (tracker?.pose_filtered ?? tracker?.pose_world)?.position[2];
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
        deviceAction={tracker?.device_action ?? null}
        bindings={bindings}
      />
      <table className="pose-table">
        <tbody>
          <PoseRow name="raw" pose={tracker?.pose_raw} />
          <PoseRow name="world" pose={tracker?.pose_world} />
          <PoseRow name="filtered" pose={tracker?.pose_filtered} />
          <PoseRow name="anchor" pose={tracker?.anchor_tcp} />
          <PoseRow name="target" pose={tracker?.target_tcp} />
        </tbody>
      </table>
      <div className="kv">
        <span className="dim">z ({tracker?.pose_filtered ? "filtered" : "world"})</span>
        <span className="mono" style={{ fontSize: 20 }} data-testid="tracker-z">
          {z == null ? "—" : `${f3(z)} m`}
        </span>
      </div>
      <TrackerTrail />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings — commit semantics (13-tracker §5): a numeric field is sent as one
// `tracker_settings` action on COMMIT (Enter or blur), never per keystroke;
// checkboxes commit on click. Fields the operator is not editing follow the
// echoed `telemetry.tracker.settings`. Values outside the TrackerSettingsArgs
// bounds are never sent — the field snaps back to the echoed value.

type NumericKey = "yaw_deg" | "pos_scale" | "filter_min_cutoff_hz" | "filter_beta";

interface NumericField {
  key: NumericKey;
  label: string;
  testId: string;
  step: number;
  min?: number;
  max?: number;
}

/** Bounds mirror `TrackerSettingsArgs` (core protocol/control.py). */
export const TRACKER_NUMERIC_FIELDS: readonly NumericField[] = [
  { key: "yaw_deg", label: "yaw_deg", testId: "tracker-yaw", step: 1 },
  {
    key: "pos_scale",
    label: "pos_scale (0.1–3)",
    testId: "tracker-scale",
    step: 0.1,
    min: 0.1,
    max: 3,
  },
  {
    key: "filter_min_cutoff_hz",
    label: "filter_min_cutoff_hz (0.05–50)",
    testId: "tracker-filter-cutoff",
    step: 0.1,
    min: 0.05,
    max: 50,
  },
  {
    key: "filter_beta",
    label: "filter_beta (0–5)",
    testId: "tracker-filter-beta",
    step: 0.01,
    min: 0,
    max: 5,
  },
];

/** Effective settings with the additive filter defaults filled in. */
export function effectiveSettings(s: TrackerSettingsMsg): Required<TrackerSettingsMsg> {
  return {
    yaw_deg: s.yaw_deg,
    pos_scale: s.pos_scale,
    follow_rotation: s.follow_rotation,
    filter_enabled: s.filter_enabled ?? true,
    filter_min_cutoff_hz: s.filter_min_cutoff_hz ?? 1.0,
    filter_beta: s.filter_beta ?? 0.05,
  };
}

const DEFAULT_DRAFT: Record<NumericKey, string> = {
  yaw_deg: "0",
  pos_scale: "1",
  filter_min_cutoff_hz: "1",
  filter_beta: "0.05",
};

export interface TrackerSettingsFormProps {
  settings: TrackerSettingsMsg | null; // echoed by telemetry
  /** True when there is no session, the control link is down or the role is observer. */
  disabled: boolean;
  /** Shown under the form while disabled (e.g. "start a session to tune"). */
  disabledReason?: string;
  onChange(args: TrackerSettingsArgs): void; // → sendAction("tracker_settings", args)
}

export function TrackerSettingsForm({
  settings,
  disabled,
  disabledReason,
  onChange,
}: TrackerSettingsFormProps) {
  const [draft, setDraft] = useState<Record<NumericKey, string>>(DEFAULT_DRAFT);
  const editing = useRef(new Set<NumericKey>());
  const live = settings ? effectiveSettings(settings) : null;

  // Server-authoritative: refresh fields the operator is not editing.
  useEffect(() => {
    if (!live) return;
    setDraft((d) => {
      let next = d;
      for (const f of TRACKER_NUMERIC_FIELDS) {
        if (editing.current.has(f.key)) continue;
        const v = String(live[f.key]);
        if (next[f.key] !== v) next = { ...next, [f.key]: v };
      }
      return next;
    });
    // `live` is derived per render; the echoed object is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const commit = (f: NumericField) => {
    const raw = draft[f.key];
    const v = Number(raw);
    const valid =
      raw.trim() !== "" &&
      Number.isFinite(v) &&
      (f.min === undefined || v >= f.min) &&
      (f.max === undefined || v <= f.max);
    if (!valid) {
      // Snap back to the echoed value (or the default) — never send out-of-range args.
      setDraft((d) => ({ ...d, [f.key]: live ? String(live[f.key]) : DEFAULT_DRAFT[f.key] }));
      return;
    }
    if (live && live[f.key] === v) return; // unchanged → nothing to send
    onChange({ [f.key]: v });
  };

  const echo = live
    ? `live: yaw ${live.yaw_deg}° · scale ${live.pos_scale} · rotation ${
        live.follow_rotation ? "on" : "off"
      } · filter ${live.filter_enabled ? "on" : "off"} (cutoff ${live.filter_min_cutoff_hz} Hz, beta ${
        live.filter_beta
      })`
    : "live: — (no telemetry)";

  return (
    <fieldset className="panel settings-form" data-testid="tracker-settings" disabled={disabled}>
      <strong>Tracker settings</strong>
      {TRACKER_NUMERIC_FIELDS.map((f) => (
        <label className="kv" key={f.key}>
          <span>{f.label}</span>
          <input
            type="number"
            step={f.step}
            min={f.min}
            max={f.max}
            value={draft[f.key]}
            disabled={disabled}
            data-testid={f.testId}
            onFocus={() => editing.current.add(f.key)}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit(f);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft((d) => ({ ...d, [f.key]: live ? String(live[f.key]) : d[f.key] }));
                e.currentTarget.blur();
              }
            }}
            onBlur={() => {
              editing.current.delete(f.key);
              commit(f);
            }}
          />
        </label>
      ))}
      <label className="kv">
        <span>follow_rotation</span>
        <input
          type="checkbox"
          checked={live?.follow_rotation ?? true}
          disabled={disabled}
          data-testid="tracker-follow-rotation"
          onChange={(e) => onChange({ follow_rotation: e.target.checked })}
        />
      </label>
      <label className="kv">
        <span>filter_enabled (One Euro)</span>
        <input
          type="checkbox"
          checked={live?.filter_enabled ?? true}
          disabled={disabled}
          data-testid="tracker-filter-enabled"
          onChange={(e) => onChange({ filter_enabled: e.target.checked })}
        />
      </label>
      <div className="mono dim" style={{ fontSize: 12 }} data-testid="tracker-settings-echo">
        {echo}
      </div>
      <div className="dim" style={{ fontSize: 11 }}>
        Numbers are sent on Enter / blur (not per keystroke); a settings change while clutched
        re-anchors — the arm never moves.
      </div>
      {disabled && disabledReason && (
        <div className="dim" style={{ fontSize: 12 }} data-testid="tracker-settings-disabled">
          {disabledReason}
        </div>
      )}
    </fieldset>
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
