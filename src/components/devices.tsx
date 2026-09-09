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
import { armTitle, MODE_LABELS, SCENE_DISPLAY_NAME, TAB_LABELS } from "../lib/streams";
import type { GamepadState } from "../store";
import { ControllerView } from "./ControllerView";
import {
  activePhaseLabel,
  fmtWhen,
  isCalibrationActive,
  type WizardKind,
} from "./TrackerCalibrationWizard";
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
              ? `CLUTCH${tracker.engaged_arm ? ` · ${armTitle(tracker.engaged_arm)}` : ""}`
              : "released"}
          </span>{" "}
          {tracker && (
            <span
              className={`chip ${tracker.charging ? "chip-green" : "chip-grey"}`}
              data-testid="tracker-charging"
              title={
                tracker.charging == null
                  ? "controller USB-power state not reported by libsurvive"
                  : tracker.charging
                    ? "controller on external (USB) power"
                    : "controller running on battery (a drained battery weakens the radio link)"
              }
            >
              {tracker.charging == null
                ? "battery —"
                : tracker.charging
                  ? "🔌 charging"
                  : "🔋 battery"}
            </span>
          )}
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
    label: "filter_beta (0–200)",
    testId: "tracker-filter-beta",
    step: 0.5,
    min: 0,
    max: 200,
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
    filter_beta: s.filter_beta ?? 10.0,
  };
}

const DEFAULT_DRAFT: Record<NumericKey, string> = {
  yaw_deg: "0",
  pos_scale: "1",
  filter_min_cutoff_hz: "1",
  filter_beta: "10",
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
// Calibration (phase-10, 13-tracker §4/§5): entry points for the two wizard
// kinds plus the persisted calibration state. Both flows are session-less REST
// operations (`/api/tracker/calibration`), so the panel is gated on the
// tracker/backend and on the ABSENCE of a session; progress lives in telemetry.

export interface CalibrationPanelProps {
  tracker: TrackerTelemetry | null;
  session: SessionInfo | null;
  onOpen(kind: WizardKind): void;
}

/** Why a wizard button is disabled (undefined = enabled).
 *
 * Without `kind` this is the reason shared by BOTH kinds (what the panel prints
 * once). With `kind` it also applies the per-kind gate: the runtime refuses
 * `base_station start` unless the backend is libsurvive (409 "backend is not
 * libsurvive", `devices/tracker_calibration.py`), while the yaw gesture works on
 * the `fake` backend too — 13-tracker §5 said so from the start, but until
 * 2026-09-07 the button was enabled and the operator met the 409 as a toast. */
export function calibrationDisabledReason(
  tracker: TrackerTelemetry | null,
  session: SessionInfo | null,
  kind?: WizardKind,
): string | undefined {
  if (!tracker) return "No tracker telemetry.";
  if (tracker.backend === "none") return "Tracker backend is none — nothing to calibrate.";
  if (tracker.calibration == null) return "Runtime reports no calibration state (upgrade it).";
  if (session) return "Stop the session first.";
  if (kind === "base_station" && tracker.backend !== "libsurvive") {
    return `Base-station calibration needs the libsurvive backend (this runtime runs ${tracker.backend}).`;
  }
  return undefined;
}

export function CalibrationPanel({ tracker, session, onOpen }: CalibrationPanelProps) {
  const cal = tracker?.calibration ?? null;
  const reason = calibrationDisabledReason(tracker, session);
  // Same predicate as the wizard's Close→confirm: mirrors the runtime's `active`
  // (which 409s session start and the other kind's start), incl. the two
  // not-yet-finished `done` states (validated/not installed, fitted/not applied).
  const activeCal = cal && isCalibrationActive(cal) ? cal : null;
  const activeKind = activeCal ? (activeCal.kind ?? "none") : null;
  // Per-kind gate on top of the shared one (base_station needs libsurvive).
  const kindReason = (kind: WizardKind) => calibrationDisabledReason(tracker, session, kind);
  const button = (kind: WizardKind, label: string) => {
    const own = kindReason(kind);
    const otherActive = activeKind !== null && activeKind !== kind;
    return (
      <button
        disabled={own !== undefined || otherActive}
        title={otherActive ? `${activeKind} calibration in progress` : own}
        onClick={() => onOpen(kind)}
        data-testid={`calibration-open-${kind}`}
      >
        {activeKind === kind ? "Resume " : ""}
        {label}…
      </button>
    );
  };
  // A reason that applies to ONE kind only is shown separately, so the shared
  // line (`calibration-disabled`) keeps meaning "neither kind is available".
  const perKind = reason === undefined ? kindReason("base_station") : undefined;
  return (
    <div className="panel" data-testid="calibration-panel">
      <div className="kv">
        <strong>Tracker calibration</strong>
        <span>
          {cal == null ? (
            <span className="chip chip-grey" data-testid="calibration-yaw-chip">
              yaw —
            </span>
          ) : cal.yaw_valid === false ? (
            <span
              className="chip chip-amber"
              data-testid="calibration-yaw-chip"
              title="a base-station install re-anchored the world frame: run Yaw alignment"
            >
              yaw alignment needed
            </span>
          ) : (
            <span className="chip chip-green" data-testid="calibration-yaw-chip">
              {cal.yaw_calibrated_at == null
                ? "yaw aligned (config)"
                : `yaw aligned ${fmtWhen(cal.yaw_calibrated_at)}`}
            </span>
          )}
          {activeCal !== null && (
            <>
              {" "}
              <span className="chip chip-blue" data-testid="calibration-active">
                {activeKind} · {activePhaseLabel(activeCal)}
              </span>
            </>
          )}
        </span>
      </div>
      <div className="mono dim" style={{ fontSize: 12 }} data-testid="calibration-installed">
        base stations:{" "}
        {cal?.base_station_installed_at == null
          ? "no install recorded"
          : `installed ${fmtWhen(cal.base_station_installed_at)}`}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {button("base_station", "Base-station calibration")}
        {button("yaw", "Yaw alignment")}
      </div>
      {reason && (
        <div className="dim" style={{ fontSize: 12 }} data-testid="calibration-disabled">
          {reason}
        </div>
      )}
      {perKind && (
        <div className="dim" style={{ fontSize: 12 }} data-testid="calibration-kind-note">
          {perKind}
        </div>
      )}
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
            Start {MODE_LABELS.teleop} · {TAB_LABELS.sim}
          </button>
        )}
      </div>
      {session ? (
        <div className="mono dim" style={{ fontSize: 12 }} data-testid="session-summary">
          {MODE_LABELS[session.mode]} · {scene ?? "scene ?"} · arms{" "}
          {session.arms.map(armTitle).join(", ")} · {session.state}
        </div>
      ) : (
        <div className="dim" style={{ fontSize: 12 }}>
          No session — device panels still work; streams need a session. Scene: {SCENE_DISPLAY_NAME}
          .
        </div>
      )}
    </div>
  );
}
