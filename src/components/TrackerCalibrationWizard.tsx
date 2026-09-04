/** Tracker calibration wizard (phase-10; 13-tracker §4/§5): base-station
 * calibration and yaw alignment as an in-page modal on the Devices page.
 *
 * Every piece of flow state comes from `telemetry.tracker.calibration`
 * (`useStore(selectTracker)?.calibration`) — the wizard keeps no step counter
 * of its own, so a page reload or a second tab lands on the same step.
 * Commands go through `POST /api/tracker/calibration`; a 409 `detail` from the
 * runtime's state machine becomes an error toast. */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ApiError, postTrackerCalibration } from "../api/rest";
import type {
  TrackerCalibrationCommand,
  TrackerCalibrationStatus,
  TrackerTelemetry,
  YawGesturePoint,
} from "../gen";
import { selectTracker, useStore } from "../store";
import { Sheet } from "./Sheet";

export type WizardKind = TrackerCalibrationCommand["kind"];
type Op = TrackerCalibrationCommand["op"];
type Phase = NonNullable<TrackerCalibrationStatus["phase"]>;
type YawLabel = YawGesturePoint["label"];

/** Phases during which the runtime has the reader in a calibration mode (or a
 * worker thread running); Close must confirm, the panel shows "in progress". */
const ACTIVE_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  "starting",
  "capturing",
  "validating",
  "fitting",
  "installing",
]);

/** Mirror of the runtime's `TrackerCalibration.active` — the flag that makes
 * `POST /api/session` and the other kind's `start` answer 409. `done` is
 * overloaded and still active twice: base-station `done` after validate (the
 * reader is still on the temporary config in frozen-validation mode until
 * install / abort) and yaw `done` after fit (the worker still runs until
 * apply / abort). Only install / apply / abort / failed end a run. */
export function isCalibrationActive(c: TrackerCalibrationStatus | null | undefined): boolean {
  if (!c) return false;
  const phase = c.phase ?? "idle";
  if (ACTIVE_PHASES.has(phase)) return true;
  if (phase !== "done") return false;
  if (c.kind === "base_station") return c.installed_path == null;
  if (c.kind === "yaw") return c.applied_yaw_deg == null;
  return false;
}

/** Operator-facing phase label for an active run: a bare `done` would read as
 * finished, so say what the runtime is still waiting for. */
export function activePhaseLabel(c: TrackerCalibrationStatus): string {
  const phase = c.phase ?? "idle";
  if (phase !== "done") return phase;
  return c.kind === "base_station" ? "done, not installed" : "done, not applied";
}

/** Unix seconds → short local date/time ("—" when unknown). */
export function fmtWhen(ts: number | null | undefined): string {
  if (ts == null) return "—";
  return new Date(ts * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** `TrackerCalibrationConfig.min_scenes` default; the status has no field for
 * it, so the capture step reads the runtime's `detail` ("scenes 3/6 — …") and
 * falls back to this. */
const DEFAULT_MIN_SCENES = 6;
export function minScenesFrom(detail: string | undefined): number {
  const m = /scenes\s+\d+\s*\/\s*(\d+)/i.exec(detail ?? "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MIN_SCENES;
}

const BASE_STEPS = ["Intro", "Capture", "Validate", "Done"] as const;
const YAW_STEPS = ["Intro", "Points", "Fit", "Done"] as const;

type View = "intro" | "failed" | "capture" | "validate" | "points" | "fit" | "done";

/** Map the telemetry snapshot (already filtered to this wizard's kind) to a
 * view + step-bar index. `done` is overloaded by the runtime: base-station
 * `done` after validate (results, not installed) vs after install
 * (`installed_path`); yaw `done` after fit (`fitted_yaw_deg`) vs after apply
 * (`applied_yaw_deg`). */
export function viewFor(
  kind: WizardKind,
  s: TrackerCalibrationStatus | null,
): { view: View; step: number } {
  const phase = s?.phase ?? "idle";
  if (!s || phase === "idle") return { view: "intro", step: 0 };
  if (phase === "failed" || phase === "aborted") return { view: "failed", step: 0 };
  if (kind === "base_station") {
    if (phase === "starting" || phase === "capturing") return { view: "capture", step: 1 };
    if (phase === "validating" || phase === "installing") return { view: "validate", step: 2 };
    if (s.installed_path) return { view: "done", step: 3 };
    return { view: "validate", step: 2 };
  }
  if (phase === "starting" || phase === "capturing") return { view: "points", step: 1 };
  if (phase === "fitting") return { view: "fit", step: 2 };
  if (s.applied_yaw_deg != null) return { view: "done", step: 3 };
  return { view: "fit", step: 2 };
}

/** Operator frame (CLAUDE.md "Hardware facts", 13-tracker §6): the operator
 * stands at the +Y edge facing −Y; left = +X (rail zero / obstacle end),
 * right = −X (the Manipulation Arm's end of the rails). The runtime's fit encodes the same map. */
const YAW_INSTRUCTIONS: Record<YawLabel, string> = {
  start:
    "Hold the controller at a comfortable start position in front of you, hold still, then pull the trigger or click Capture",
  left: "Move LEFT 20–30 cm (+X, toward rail zero / the obstacle), hold still, pull the trigger or click Capture",
  forward:
    "Move FORWARD 20–30 cm (−Y, away from you into the table), hold still, pull the trigger or click Capture",
  right:
    "Move RIGHT 20–30 cm (−X, toward the parked arms), hold still, pull the trigger or click Capture",
  back: "Move BACK 20–30 cm (+Y, toward you), hold still, pull the trigger or click Capture",
  up: "Raise the controller 20–30 cm straight UP, hold still, pull the trigger or click Capture",
  down: "Lower the controller 20–30 cm straight DOWN, hold still, pull the trigger or click Capture",
};

const f3 = (v: number) => v.toFixed(3);
const f1 = (v: number) => v.toFixed(1);

function Footer({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>{children}</div>;
}

export interface TrackerCalibrationWizardProps {
  kind: WizardKind;
  onClose(): void;
  /** Default true; `false` runs the Sheet exit while the owner keeps it mounted. */
  open?: boolean;
  /** Base-station Done step → "Start yaw alignment" switches the wizard kind. */
  onSwitchKind?(kind: WizardKind): void;
}

export function TrackerCalibrationWizard({
  kind,
  onClose,
  onSwitchKind,
  open = true,
}: TrackerCalibrationWizardProps) {
  const tracker = useStore(selectTracker);
  const addToast = useStore((s) => s.addToast);
  const [busy, setBusy] = useState(false);
  const [confirmAbort, setConfirmAbort] = useState(false);

  const cal = tracker?.calibration ?? null;
  // Only a snapshot of OUR kind drives the steps; another kind's live run is
  // surfaced as a blocker on the intro.
  const mine = cal && cal.kind === kind ? cal : null;
  const other = cal && cal.kind !== kind && isCalibrationActive(cal) ? cal : null;
  const active = isCalibrationActive(mine);
  const { view, step } = viewFor(kind, mine);
  const steps = kind === "base_station" ? BASE_STEPS : YAW_STEPS;
  const title = kind === "base_station" ? "Base-station calibration" : "Yaw alignment";

  const send = useCallback(
    async (op: Op, point?: YawLabel) => {
      setBusy(true);
      try {
        await postTrackerCalibration({ kind, op, ...(point ? { point } : {}) });
      } catch (e) {
        const detail =
          e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e);
        addToast(`calibration: ${detail}`, "error");
      } finally {
        setBusy(false);
      }
    },
    [kind, addToast],
  );

  // Close = plain close when nothing runs; otherwise ask before aborting.
  const requestClose = useCallback(() => {
    if (active) setConfirmAbort(true);
    else onClose();
  }, [active, onClose]);
  const abortAndClose = useCallback(async () => {
    await send("abort");
    onClose();
  }, [send, onClose]);

  // Escape is owned here (not by Sheet: `closeOnEscape={false}`) because it has
  // to dismiss the abort prompt first; preventDefault also suppresses the
  // native <dialog> `cancel`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.code !== "Escape") return;
      e.preventDefault();
      if (confirmAbort) setConfirmAbort(false);
      else requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmAbort, requestClose]);
  // The run ended (done/failed) while the prompt was up → nothing left to abort.
  useEffect(() => {
    if (!active) setConfirmAbort(false);
  }, [active]);

  let body: ReactNode;
  if (view === "intro") {
    body =
      kind === "base_station" ? (
        <BaseIntro
          tracker={tracker}
          other={other}
          busy={busy}
          onStart={() => void send("start")}
          onClose={onClose}
        />
      ) : (
        <YawIntro other={other} busy={busy} onStart={() => void send("start")} onClose={onClose} />
      );
  } else if (view === "failed") {
    body = <Failure s={mine!} busy={busy} onRetry={() => void send("start")} onClose={onClose} />;
  } else if (view === "capture") {
    body = <BaseCapture s={mine!} busy={busy} send={send} />;
  } else if (view === "validate") {
    body = <BaseValidate s={mine!} busy={busy} send={send} />;
  } else if (view === "points") {
    body = <YawPoints s={mine!} busy={busy} send={send} />;
  } else if (view === "fit") {
    body = <YawFit s={mine!} busy={busy} send={send} />;
  } else if (kind === "base_station") {
    body = (
      <BaseDone
        s={mine!}
        onStartYaw={onSwitchKind ? () => onSwitchKind("yaw") : undefined}
        onClose={onClose}
      />
    );
  } else {
    body = <YawDone s={mine!} busy={busy} onRedo={() => void send("start")} onClose={onClose} />;
  }

  return (
    <Sheet
      title={title}
      open={open}
      width={620}
      hostTestId="calibration-wizard"
      testId="calibration-wizard-dialog"
      closeButtonTestId="wizard-close"
      panelProps={{ "data-view": view }}
      closeOnEscape={false}
      onRequestClose={requestClose}
      headerExtra={
        <ol className="wizard-steps" data-testid="wizard-steps">
          {steps.map((label, i) => (
            <li
              key={label}
              className={`wizard-step${i === step ? " is-active" : ""}`}
              aria-current={i === step ? "step" : undefined}
              data-testid={`wizard-step-${i}`}
            >
              {i < step ? "✓ " : `${i + 1}. `}
              {label}
            </li>
          ))}
        </ol>
      }
    >
      {confirmAbort && (
        <div
          className="kv"
          style={{ alignItems: "center", color: "var(--warn)" }}
          data-testid="wizard-abort-confirm"
        >
          <strong>Abort calibration? The run in progress is discarded.</strong>
          <span style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmAbort(false)} data-testid="wizard-abort-cancel">
              Continue
            </button>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => void abortAndClose()}
              data-testid="wizard-abort-ok"
            >
              Abort
            </button>
          </span>
        </div>
      )}
      {body}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Shared bits

function OtherRunNotice({ other }: { other: TrackerCalibrationStatus | null }) {
  if (!other) return null;
  return (
    <div className="banner banner-amber" data-testid="wizard-other-active">
      A {other.kind} calibration is in progress ({activePhaseLabel(other)}) — finish or abort it
      first.
    </div>
  );
}

function Failure({
  s,
  busy,
  onRetry,
  onClose,
}: {
  s: TrackerCalibrationStatus;
  busy: boolean;
  onRetry(): void;
  onClose(): void;
}) {
  const failed = s.phase === "failed";
  return (
    <>
      <div
        className={`banner ${failed ? "banner-red" : "banner-amber"}`}
        data-testid="wizard-failure"
      >
        {failed ? "Calibration failed" : "Calibration aborted"}
      </div>
      <div data-testid="wizard-detail">{s.detail || "—"}</div>
      <div className="dim" style={{ fontSize: 12 }}>
        The tracker is back in normal mode. Retry starts the flow from the beginning.
      </div>
      <Footer>
        <button onClick={onClose} data-testid="wizard-close-btn">
          Close
        </button>
        <button
          className="btn-primary"
          autoFocus
          data-autofocus
          disabled={busy}
          onClick={onRetry}
          data-testid="wizard-retry"
        >
          Retry
        </button>
      </Footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Base-station calibration

function BaseIntro({
  tracker,
  other,
  busy,
  onStart,
  onClose,
}: {
  tracker: TrackerTelemetry | null;
  other: TrackerCalibrationStatus | null;
  busy: boolean;
  onStart(): void;
  onClose(): void;
}) {
  const tracking = tracker?.status === "tracking";
  return (
    <>
      <OtherRunNotice other={other} />
      <div>
        Re-solves the relative poses of the Lighthouse base stations with libsurvive&apos;s global
        scene solver (≥ {DEFAULT_MIN_SCENES} still scenes). A single-spot solution leaves the
        stations inconsistent by tens of centimetres and the pose jumps between them; the
        multi-position solve is millimetre-consistent. Yaw alignment must be redone afterwards.
      </div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          Controller powered on and tracked{" "}
          <span
            className={`chip ${tracking ? "chip-green" : "chip-amber"}`}
            data-testid="wizard-req-tracking"
          >
            {tracker ? `${tracker.backend} · ${tracker.status}` : "no telemetry"}
          </span>
        </li>
        <li>All three base stations visible from the workspace</li>
        <li>No session running (teleop is frozen while the solver runs)</li>
      </ul>
      <Footer>
        <button onClick={onClose} data-testid="wizard-close-btn">
          Close
        </button>
        <button
          className="btn-primary"
          autoFocus
          data-autofocus
          disabled={busy || other !== null}
          onClick={onStart}
          data-testid="wizard-start"
        >
          Start
        </button>
      </Footer>
    </>
  );
}

function BaseCapture({
  s,
  busy,
  send,
}: {
  s: TrackerCalibrationStatus;
  busy: boolean;
  send(op: Op): Promise<void>;
}) {
  const min = minScenesFrom(s.detail);
  const scenes = s.scenes ?? 0;
  const enough = scenes >= min;
  const visible = s.stations_visible ?? 0;
  const still = s.controller_still;
  const lighthouses = s.lighthouses ?? [];
  return (
    <>
      <div className="kv" style={{ alignItems: "baseline" }}>
        <span className="mono" style={{ fontSize: 28 }} data-testid="wizard-scenes">
          scenes {scenes} / {min}
        </span>
        <span>
          <span
            className={`chip ${still == null ? "chip-grey" : still ? "chip-green" : "chip-amber"}`}
            data-testid="wizard-still"
          >
            {still == null ? "controller —" : still ? "controller still" : "controller moving"}
          </span>{" "}
          <span
            className={`chip ${visible >= 3 ? "chip-green" : "chip-amber"}`}
            data-testid="wizard-stations-visible"
          >
            {visible} stations visible
          </span>
        </span>
      </div>
      <span
        className="analog"
        role="progressbar"
        aria-valuenow={scenes}
        aria-valuemin={0}
        aria-valuemax={min}
      >
        <span
          className="analog-fill"
          style={{ width: `${Math.min(100, (scenes / min) * 100)}%` }}
          data-testid="wizard-scenes-fill"
        />
      </span>
      <table className="stations-table" data-testid="wizard-stations">
        <thead>
          <tr>
            <th>LH</th>
            <th>channel</th>
            <th>serial</th>
            <th>scenes</th>
            <th>reference</th>
          </tr>
        </thead>
        <tbody>
          {lighthouses.length === 0 ? (
            <tr>
              <td colSpan={5} className="dim">
                no base stations reported yet
              </td>
            </tr>
          ) : (
            lighthouses.map((lh) => (
              <tr key={lh.index} data-testid={`wizard-station-${lh.index}`}>
                <td className="mono">{lh.index}</td>
                <td className="mono">{lh.channel ?? "—"}</td>
                <td className="mono">{lh.serial ?? "—"}</td>
                <td className="mono">{lh.scenes ?? 0}</td>
                <td>{lh.reference ? <span className="chip chip-blue">reference</span> : ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {s.detail && <div data-testid="wizard-detail">{s.detail}</div>}
      <div className="dim" style={{ fontSize: 12 }}>
        Park the controller still for ≥ 3 s at each spot, then walk to the next one; spread ≥ {min}{" "}
        spots around the workspace with all stations in view. The solver only records a scene while
        the controller is still and &gt; 3 s after the previous scene.
      </div>
      <Footer>
        <button
          className="btn-danger"
          disabled={busy}
          onClick={() => void send("abort")}
          data-testid="wizard-abort"
        >
          Abort
        </button>
        <button
          className="btn-primary"
          disabled={busy || !enough || s.phase !== "capturing"}
          title={
            enough ? undefined : `need ${min - scenes} more scene${min - scenes === 1 ? "" : "s"}`
          }
          onClick={() => void send("validate")}
          data-testid="wizard-validate"
        >
          Validate
        </button>
      </Footer>
    </>
  );
}

function BaseValidate({
  s,
  busy,
  send,
}: {
  s: TrackerCalibrationStatus;
  busy: boolean;
  send(op: Op): Promise<void>;
}) {
  const v = s.validation ?? null;
  const running = s.phase === "validating";
  const installing = s.phase === "installing";
  const canInstall = !busy && !running && !installing && v?.passed === true;
  return (
    <>
      {running && (
        <div className="kv" style={{ alignItems: "center" }} data-testid="wizard-validating">
          <span>Hold the controller still — measuring positional noise…</span>
          <span className="analog">
            <span
              className="analog-fill"
              style={{ width: "100%", animation: "pulse 1s ease-in-out infinite" }}
            />
          </span>
        </div>
      )}
      {installing && (
        <div className="kv" data-testid="wizard-installing">
          <span>Installing the new base-station solution and restarting the tracker…</span>
        </div>
      )}
      {v ? (
        <>
          <table className="stations-table" data-testid="wizard-validation">
            <tbody>
              <tr>
                <td className="dim">samples</td>
                <td className="mono">{v.samples ?? 0}</td>
                <td />
              </tr>
              <tr data-testid="wizard-validation-std">
                <td className="dim">std x / y / z</td>
                <td className="mono">{(v.std_mm ?? [0, 0, 0]).map(f1).join(" / ")} mm</td>
                <td className="dim">&lt; {v.threshold_std_mm ?? 5} mm each</td>
              </tr>
              <tr data-testid="wizard-validation-step">
                <td className="dim">max step</td>
                <td className="mono">{f1(v.max_step_mm ?? 0)} mm</td>
                <td className="dim">&lt; {v.threshold_step_mm ?? 20} mm</td>
              </tr>
            </tbody>
          </table>
          <div className="kv" style={{ alignItems: "center" }}>
            <span
              className={`chip ${v.passed ? "chip-green" : "chip-red"}`}
              data-testid="wizard-validation-result"
            >
              {v.passed ? "PASS" : "FAIL"}
            </span>
            <span data-testid="wizard-detail">{s.detail}</span>
          </div>
        </>
      ) : (
        s.detail && <div data-testid="wizard-detail">{s.detail}</div>
      )}
      <Footer>
        <button
          className="btn-danger"
          disabled={busy || installing}
          onClick={() => void send("abort")}
          data-testid="wizard-abort"
        >
          Abort
        </button>
        <button
          disabled={busy || running || installing}
          onClick={() => void send("capture")}
          title="Keep the current solution and record more still spots"
          data-testid="wizard-capture-more"
        >
          Capture more
        </button>
        <button
          className="btn-primary"
          autoFocus
          data-autofocus
          disabled={!canInstall}
          title={v && !v.passed ? "validation failed — capture more spots" : undefined}
          onClick={() => void send("install")}
          data-testid="wizard-install"
        >
          {installing ? "Installing…" : "Install"}
        </button>
      </Footer>
    </>
  );
}

function BaseDone({
  s,
  onStartYaw,
  onClose,
}: {
  s: TrackerCalibrationStatus;
  onStartYaw?: () => void;
  onClose(): void;
}) {
  return (
    <>
      <div className="banner banner-amber" data-testid="wizard-yaw-required">
        Yaw alignment required — the new solution re-anchored the lighthouse world frame.
      </div>
      <div className="kv">
        <span className="dim">installed</span>
        <span className="mono" style={{ fontSize: 12 }} data-testid="wizard-installed-path">
          {s.installed_path ?? "—"}
        </span>
      </div>
      <div className="kv">
        <span className="dim">backup</span>
        <span className="mono" style={{ fontSize: 12 }} data-testid="wizard-backup-path">
          {s.backup_path ?? "—"}
        </span>
      </div>
      {s.detail && (
        <div className="dim" data-testid="wizard-detail">
          {s.detail}
        </div>
      )}
      <Footer>
        <button onClick={onClose} data-testid="wizard-close-btn">
          Close
        </button>
        {onStartYaw && (
          <button
            className="btn-primary"
            autoFocus
            data-autofocus
            onClick={onStartYaw}
            data-testid="wizard-start-yaw"
          >
            Start yaw alignment
          </button>
        )}
      </Footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Yaw alignment

function YawIntro({
  other,
  busy,
  onStart,
  onClose,
}: {
  other: TrackerCalibrationStatus | null;
  busy: boolean;
  onStart(): void;
  onClose(): void;
}) {
  return (
    <>
      <OtherRunNotice other={other} />
      <div>
        Fits <code>tracker_settings.yaw_deg</code> (lighthouse world → MJCF world) from a 7-click
        gesture instead of a typed number. Redo it after every base-station install.
      </div>
      <div>Stand at the operator edge of the table (+Y) facing the arms (−Y). Then:</div>
      <ul style={{ margin: 0, paddingLeft: 18 }} data-testid="wizard-yaw-legend">
        <li>
          <strong>left</strong> = +X (toward rail zero / the obstacle)
        </li>
        <li>
          <strong>forward</strong> = −Y (away from you, into the table)
        </li>
        <li>
          <strong>right</strong> = −X (toward the parked arms)
        </li>
        <li>
          <strong>back</strong> = +Y (toward you)
        </li>
        <li>
          <strong>up / down</strong> = ±Z
        </li>
      </ul>
      <div className="dim" style={{ fontSize: 12 }}>
        Sequence: start → left → forward → right → back → up → down; each leg 20–30 cm. Hold still,
        then pull the trigger or click Capture. Standing anywhere else flips the yaw by 180°.
      </div>
      <Footer>
        <button onClick={onClose} data-testid="wizard-close-btn">
          Close
        </button>
        <button
          className="btn-primary"
          autoFocus
          data-autofocus
          disabled={busy || other !== null}
          onClick={onStart}
          data-testid="wizard-start"
        >
          Start
        </button>
      </Footer>
    </>
  );
}

function YawPoints({
  s,
  busy,
  send,
}: {
  s: TrackerCalibrationStatus;
  busy: boolean;
  send(op: Op): Promise<void>;
}) {
  const next = s.next_point ?? null;
  const points = s.yaw_points ?? [];
  return (
    <>
      <div className="kv" style={{ alignItems: "baseline" }}>
        <span className="mono" style={{ fontSize: 28 }} data-testid="wizard-next-point">
          {next ? next.toUpperCase() : "—"}
        </span>
        <span className="mono dim" data-testid="wizard-points-count">
          {points.length} / 7
        </span>
      </div>
      <div data-testid="wizard-instruction">
        {next ? YAW_INSTRUCTIONS[next] : "All seven points captured — fitting…"}
      </div>
      {points.length > 0 && (
        <ol
          className="mono dim"
          style={{ margin: 0, paddingLeft: 24, fontSize: 12 }}
          data-testid="wizard-points"
        >
          {points.map((p) => (
            <li key={p.label} data-testid={`wizard-point-${p.label}`}>
              {p.label}: [{f3(p.pose.position[0])}, {f3(p.pose.position[1])},{" "}
              {f3(p.pose.position[2])}]
            </li>
          ))}
        </ol>
      )}
      {s.detail && (
        <div className="dim" style={{ fontSize: 12 }} data-testid="wizard-detail">
          {s.detail}
        </div>
      )}
      <Footer>
        <button
          className="btn-danger"
          disabled={busy}
          onClick={() => void send("abort")}
          data-testid="wizard-abort"
        >
          Abort
        </button>
        <button disabled={busy} onClick={() => void send("start")} data-testid="wizard-restart">
          Restart
        </button>
        <button
          className="btn-primary"
          autoFocus
          data-autofocus
          disabled={busy || !next}
          onClick={() => void send("capture")}
          data-testid="wizard-capture"
        >
          Capture
        </button>
      </Footer>
    </>
  );
}

function YawFit({
  s,
  busy,
  send,
}: {
  s: TrackerCalibrationStatus;
  busy: boolean;
  send(op: Op): Promise<void>;
}) {
  const fitting = s.phase === "fitting";
  const fitted = s.fitted_yaw_deg ?? null;
  const residual = s.fit_residual_deg ?? null;
  const checks = s.fit_checks ?? [];
  const canApply = !busy && !fitting && fitted != null && checks.length === 0;
  return (
    <>
      <div className="kv" style={{ alignItems: "baseline" }}>
        <span className="mono" style={{ fontSize: 28 }} data-testid="wizard-fitted-yaw">
          {fitted == null ? "…" : `yaw ${f1(fitted)}°`}
        </span>
        <span className="mono dim" data-testid="wizard-fit-residual">
          residual {residual == null ? "—" : `${residual.toFixed(2)}°`}
        </span>
      </div>
      {fitting && <div data-testid="wizard-fitting">Fitting…</div>}
      {!fitting &&
        (checks.length > 0 ? (
          <div className="mapped-row" data-testid="wizard-fit-checks">
            {checks.map((c) => (
              <span key={c} className="chip chip-red">
                {c}
              </span>
            ))}
          </div>
        ) : (
          <span className="chip chip-green" data-testid="wizard-fit-ok">
            all checks passed
          </span>
        ))}
      {s.detail && (
        <div className="dim" style={{ fontSize: 12 }} data-testid="wizard-detail">
          {s.detail}
        </div>
      )}
      <Footer>
        <button
          disabled={busy || fitting}
          onClick={() => void send("abort")}
          data-testid="wizard-cancel"
        >
          Cancel
        </button>
        <button
          disabled={busy || fitting}
          onClick={() => void send("start")}
          data-testid="wizard-redo"
        >
          Redo
        </button>
        <button
          className="btn-primary"
          autoFocus
          data-autofocus
          disabled={!canApply}
          title={checks.length > 0 ? "fix the failed checks (Redo) before applying" : undefined}
          onClick={() => void send("apply")}
          data-testid="wizard-apply"
        >
          Apply
        </button>
      </Footer>
    </>
  );
}

function YawDone({
  s,
  busy,
  onRedo,
  onClose,
}: {
  s: TrackerCalibrationStatus;
  busy: boolean;
  onRedo(): void;
  onClose(): void;
}) {
  const applied = s.applied_yaw_deg ?? null;
  return (
    <>
      <div className="kv" style={{ alignItems: "baseline" }}>
        <span className="mono" style={{ fontSize: 28 }} data-testid="wizard-applied-yaw">
          {applied == null ? "—" : `yaw ${f1(applied)}°`}
        </span>
        <span className="chip chip-green">applied &amp; persisted</span>
      </div>
      <div className="dim" style={{ fontSize: 12 }}>
        <code>tracker_settings.yaw_deg</code> now follows this value (the settings form echoes it
        live) and survives a runtime restart. Verify: moving the controller toward the arm bases
        moves the end-effector toward them.
      </div>
      {s.detail && (
        <div className="dim" style={{ fontSize: 12 }} data-testid="wizard-detail">
          {s.detail}
        </div>
      )}
      <Footer>
        <button disabled={busy} onClick={onRedo} data-testid="wizard-redo">
          Redo
        </button>
        <button
          className="btn-primary"
          autoFocus
          data-autofocus
          onClick={onClose}
          data-testid="wizard-close-btn"
        >
          Close
        </button>
      </Footer>
    </>
  );
}
