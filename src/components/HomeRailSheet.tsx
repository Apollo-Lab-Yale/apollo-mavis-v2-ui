/** HomeRailSheet (phase-09c/09d, 05-ui §8.1): the operator-triggered,
 * twin-gated rail homing of ONE arm — the only maintenance action in the stack
 * that moves hardware (`home_rail`; rule 1 of phase-09c: no implicit motion,
 * ever).
 *
 * Opened from the arm card's **Home rail** button. On mount it POSTs
 * `{op: "home_rail", dry_run: true}` — the runtime sweeps the full rail travel
 * 0–0.65 m in its own digital-twin instance at the arm's CURRENT joint posture
 * (the carriage position is unknown while unhomed), with the other arm posed at
 * its last monitor sample, and answers with a `RailSweepVerdict` and zero
 * writes. The sheet renders the verdict (clear / first blocked position + pair
 * / min clearance / the other arm's pose / assumptions) under the fixed notice
 * that the carriage drives to the operator's LEFT (+X) end at the track's own
 * homing speed (75 mm/s is the post-homing positioning cap; 50 until 2026-09-09).
 *
 * Three outcomes (phase-09d, `rail_sweep.pre_position`):
 * - the posture is sweep-clear (`pre_position` absent or `needed: false`) →
 *   the 09c flow: the `.btn-destructive` **Home rail — move carriage** POSTs
 *   the real op with a 60 s client deadline, the runtime homes synchronously
 *   with the joints untouched (200, `status: done`), the sheet toasts and
 *   closes;
 * - the posture blocks the sweep but the runtime PLANNED a position-agnostic
 *   path to a rail-clear posture (`needed: true`, `clear: true`) → the sheet
 *   explains the motion (waypoints, ~duration at 10 %, target posture in
 *   degrees) and the `.btn-destructive` **Home rail — move arm, then
 *   carriage** POSTs the real op; the runtime answers 202 `status: accepted` +
 *   `job_id` and runs a `RailHomingJob` (connect → move along the path at
 *   10 % → home → verify → hold the posture, brakes on); the sheet switches to
 *   a progress view fed by `telemetry.hardware_monitor.arms[].maintenance`
 *   (phase list + detail + progress) and, once the phase reaches `done` /
 *   `failed` (or the block vanishes), fetches `GET …/maintenance/last` and
 *   toasts the final result — only a result carrying OUR `job_id`; while the
 *   telemetry stays silent about the job (WebSocket down / never a frame with
 *   our id for `JOB_FALLBACK.graceMs`) the sheet polls `/maintenance/last`
 *   itself every `JOB_FALLBACK.pollMs` so it is never stuck un-closable;
 * - no plan exists (`needed: true`, `clear: false`) → refused: the runtime's
 *   suggestion is shown, no confirm.
 * A blocked verdict without a plan block (pre-09d runtime) shows only the
 * reason (fold the arm tighter in xArm Studio and re-open); a refusal (409 /
 * `ok: false` without a verdict) shows the runtime `detail`. While the
 * carriage or the arm moves the sheet stays open and un-closable. Held mounted
 * by the owner for the Sheet exit (`useDelayedUnmount`). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ApiError,
  getArmMaintenanceLast,
  HOME_RAIL_TIMEOUT_MS,
  postArmMaintenance,
} from "../api/rest";
import type { ArmMaintenanceResult, MaintenanceProgress, RailSweepVerdict } from "../gen";
import {
  HOME_RAIL_NOTICE,
  isTerminalPhase,
  MAINTENANCE_PHASES,
  maintenanceToast,
  PHASE_LABELS,
  phaseState,
  PRE_POSITION_REFUSED_HINT,
  prePositionKind,
  prePositionSummary,
  sweepSummary,
  type PrePositionKind,
} from "../lib/maintenance";
import { ARM_LABELS, armLabel, armTitle, SCENE_DISPLAY_NAME } from "../lib/streams";
import { selectMaintenanceProgress, useStore } from "../store";
import { Icon } from "./icons";
import { Sheet } from "./Sheet";

export interface HomeRailSheetProps {
  armId: string;
  /** Default true; `false` runs the Sheet exit while the owner keeps it mounted. */
  open?: boolean;
  /** Every close path (Escape / backdrop / × / Cancel / success). Ignored while homing. */
  onRequestClose(): void;
  /** The owning card marks its maintenance strip busy while the real op / job is in flight. */
  onHomingChange?(inFlight: boolean): void;
}

export const HOME_RAIL_TITLE = "Home rail";
export const HOME_RAIL_CONFIRM = "Home rail — move carriage";
/** Confirm label when a pre-positioning motion is planned (phase-09d). */
export const HOME_RAIL_CONFIRM_PLANNED = "Home rail — move arm, then carriage";
export const HOME_RAIL_CHECKING =
  "Checking the digital twin — sweeping the full rail travel at the current posture…";
export const HOME_RAIL_HOMING =
  "Homing… the carriage is moving to the operator's LEFT end. Keep clear of the rail.";
export const HOME_RAIL_BLOCKED_HINT =
  "Fold the arm to a tighter posture in xArm Studio, then open Home rail again.";
/** Dead-end guidance (2026-09-08, operator request): the runtime only ever moves
 * the arm being homed (D1), and without a homed rail no session can open, so a
 * blocked sweep with no pre-positioning path leaves exactly one way out — the
 * vendor's desktop app. Spell it out, and name the arm to fold (the OTHER arm
 * when the blocking pair belongs to it). */
export const HOME_RAIL_STUDIO_HEADLINE =
  "The web UI cannot move an arm out of this posture — fold it with UFACTORY Studio (the desktop app), then come back:";
export const HOME_RAIL_STUDIO_STEPS = [
  "Open UFACTORY Studio for that arm's control box (the IP on its card) → Live control → Joint motion, speed ≤ 10 %.",
  "Bring joints 2–7 to about 0° (the folded factory-zero posture); leave joint 1 where it is.",
  "Close Live control in Studio — the runtime refuses sessions while Studio holds the arm.",
  "Click Home rail again here: the digital twin re-sweeps the rail at the new posture.",
] as const;

/** Which arm the operator must fold, from the first blocked pair: the OTHER arm
 * when a pair element belongs to it (`view_link3`, `view/link3`), else this arm. */
export function studioFoldTarget(
  armId: string,
  pair: readonly string[] | null | undefined,
): { armId: string; other: boolean } {
  for (const name of pair ?? []) {
    const id = /^([A-Za-z0-9]+)[/_]/.exec(name)?.[1];
    if (id !== undefined && id !== armId && id in ARM_LABELS) return { armId: id, other: true };
  }
  return { armId, other: false };
}
/** Progress-view headline while a `RailHomingJob` runs (phase-09d). */
export const HOME_RAIL_JOB_HEADLINE =
  "Rail homing job running — the arm moves first, then the carriage. Keep clear of the cell.";
export const HOME_RAIL_JOB_STARTING = "Starting the rail homing job…";
export const HOME_RAIL_JOB_FINISHING = "Fetching the job result…";
/** Detail when the job vanished from telemetry and `/maintenance/last` has no final result. */
export const HOME_RAIL_JOB_LOST =
  "the runtime stopped reporting the homing job before it finished — check the arm card's rail read-back";
/** `GET …/maintenance/last` still answers `accepted` right after the terminal
 * telemetry frame (the job thread stores its final result a beat later):
 * poll this often, this many times, before giving up. */
export const LAST_POLL_MS = 500;
export const LAST_POLL_MAX = 20;
/** Telemetry-silence fallback (phase-09d): with the job accepted but no telemetry
 * frame carrying our `job_id` for `graceMs` (or the telemetry socket not open),
 * poll `GET …/maintenance/last` every `pollMs`; a result with OUR `job_id` and a
 * status other than `accepted` settles the job. Mutable so tests can shrink it. */
export const JOB_FALLBACK = { graceMs: 10_000, pollMs: 2_000 };

type JobPhase = (typeof MAINTENANCE_PHASES)[number];

type Phase =
  | { kind: "checking" }
  | { kind: "verdict"; verdict: RailSweepVerdict; detail: string }
  | { kind: "refused"; detail: string }
  /** 09c synchronous POST in flight (joints untouched, carriage moving). */
  | { kind: "homing"; verdict: RailSweepVerdict; planned: boolean }
  /** 09d asynchronous `RailHomingJob` accepted (202); progress from telemetry. */
  | { kind: "job"; verdict: RailSweepVerdict; jobId: string; finishing: boolean }
  | { kind: "failed"; verdict: RailSweepVerdict | null; detail: string };

const errorDetail = (e: unknown): string =>
  e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e);

/** Dry-run answer → phase: the verdict when the runtime produced one (its `ok`
 * is `clear && dry_run`, so a blocked sweep is `ok: false` WITH a verdict —
 * phase-09d: also when a pre-positioning plan exists or was refused), the
 * runtime `detail` otherwise (refused before the sweep: monitor off, busy, …). */
export function phaseFromDryRun(result: ArmMaintenanceResult): Phase {
  if (result.rail_sweep) {
    return { kind: "verdict", verdict: result.rail_sweep, detail: result.detail ?? "" };
  }
  return { kind: "refused", detail: result.detail || "home_rail refused" };
}

/** Whether the destructive confirm may be offered for a verdict: a clear sweep
 * (09c) or a planned pre-positioning motion (09d). */
export const canConfirm = (v: RailSweepVerdict): boolean =>
  v.clear === true || prePositionKind(v.pre_position) === "planned";

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export function HomeRailSheet({
  armId,
  open = true,
  onRequestClose,
  onHomingChange,
}: HomeRailSheetProps) {
  const addToast = useStore((s) => s.addToast);
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const startedRef = useRef(false);
  const aliveRef = useRef(true);
  // Job bookkeeping (phase-09d): whether telemetry has shown OUR job yet, the
  // last non-terminal phase seen (marks the failed row), the last progress
  // frame (kept for the view after the block vanishes), and the fetch guard.
  const seenJobRef = useRef(false);
  const lastActiveRef = useRef<JobPhase | null>(null);
  const lastProgressRef = useRef<MaintenanceProgress | null>(null);
  const finishingRef = useRef(false);
  const selectProgress = useMemo(() => selectMaintenanceProgress(armId), [armId]);
  const progress = useStore(useShallow(selectProgress));

  // Dry run on mount (read-only; guarded against StrictMode's double effect).
  useEffect(() => {
    aliveRef.current = true;
    if (startedRef.current) return;
    startedRef.current = true;
    postArmMaintenance(armId, "home_rail", { dryRun: true })
      .then((r) => {
        if (aliveRef.current) setPhase(phaseFromDryRun(r));
      })
      .catch((e: unknown) => {
        if (aliveRef.current) setPhase({ kind: "refused", detail: errorDetail(e) });
      });
    return () => {
      aliveRef.current = false;
    };
  }, [armId]);

  const jobId = phase.kind === "job" ? phase.jobId : null;
  const jobVerdict = phase.kind === "job" ? phase.verdict : null;

  // The job's outcome (phase-09d): toast the final `ArmMaintenanceResult`, close
  // on success, else show the detail. Anything that is not OUR job's final result
  // (404, still `accepted`, a foreign `job_id` from an older op) is the lost case.
  const settle = useCallback(
    (result: ArmMaintenanceResult | null, verdict: RailSweepVerdict, id: string) => {
      if (result === null || result.status === "accepted" || result.job_id !== id) {
        const detail = lastProgressRef.current?.detail || HOME_RAIL_JOB_LOST;
        addToast(`${armLabel(armId)} · ${detail}`, "error");
        if (aliveRef.current) setPhase({ kind: "failed", verdict, detail });
        onHomingChange?.(false);
        return;
      }
      const { text, tone } = maintenanceToast(result);
      addToast(text, tone);
      onHomingChange?.(false);
      if (!aliveRef.current) return;
      if (result.ok) onRequestClose();
      else {
        setPhase({
          kind: "failed",
          verdict,
          detail: result.detail || lastProgressRef.current?.detail || "home_rail failed",
        });
      }
    },
    [armId, addToast, onHomingChange, onRequestClose],
  );

  // Job progress → terminal handling (phase-09d): once telemetry reports our
  // job `done` / `failed` — or the block disappears after we saw it — fetch the
  // final result from `/maintenance/last` (polling while it still says
  // `accepted` — the runtime stores the 202's result there until the job ends)
  // and hand it to `settle` (a foreign `job_id` there = the lost case).
  useEffect(() => {
    if (jobId === null || jobVerdict === null || finishingRef.current) return;
    const mine = progress !== null && progress.job_id === jobId;
    if (mine) {
      seenJobRef.current = true;
      lastProgressRef.current = progress;
      if (!isTerminalPhase(progress.phase)) {
        lastActiveRef.current = progress.phase as JobPhase;
        return;
      }
    } else if (!seenJobRef.current) {
      return; // not reported yet — the first frame is on its way (or the fallback poll acts)
    }
    // Terminal phase seen, or the job vanished from telemetry: fetch the result.
    finishingRef.current = true;
    setPhase({ kind: "job", verdict: jobVerdict, jobId, finishing: true });
    const finish = async () => {
      let result: ArmMaintenanceResult | null = null;
      try {
        for (let attempt = 0; attempt < LAST_POLL_MAX; attempt += 1) {
          result = await getArmMaintenanceLast(armId);
          if (result === null || result.status !== "accepted") break;
          await sleep(LAST_POLL_MS);
          if (!aliveRef.current) return;
        }
      } catch (e) {
        const detail = errorDetail(e);
        addToast(`${armLabel(armId)} · ${detail}`, "error");
        if (aliveRef.current) setPhase({ kind: "failed", verdict: jobVerdict, detail });
        onHomingChange?.(false);
        return;
      }
      settle(result, jobVerdict, jobId);
    };
    void finish();
  }, [progress, jobId, jobVerdict, armId, addToast, onHomingChange, settle]);

  // Telemetry-silence fallback (phase-09d): the progress effect above needs one
  // frame with our job_id to ever finish. If none arrives within the grace (the
  // telemetry socket is down, the runtime restarted, …) poll `/maintenance/last`
  // and settle on OUR job's final result; a foreign or `accepted` result is
  // ignored and the poll goes on.
  const jobFinishing = phase.kind === "job" && phase.finishing;
  useEffect(() => {
    if (jobId === null || jobVerdict === null || jobFinishing) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (finishingRef.current || !aliveRef.current) return;
      const telemetryOpen = useStore.getState().conn.telemetry === "open";
      if (seenJobRef.current && telemetryOpen) return;
      if (Date.now() - startedAt < JOB_FALLBACK.graceMs) return;
      void (async () => {
        let result: ArmMaintenanceResult | null;
        try {
          result = await getArmMaintenanceLast(armId);
        } catch {
          return; // transient: the next tick retries
        }
        if (finishingRef.current || !aliveRef.current) return;
        if (result !== null && result.job_id === jobId && result.status !== "accepted") {
          finishingRef.current = true;
          setPhase({ kind: "job", verdict: jobVerdict, jobId, finishing: true });
          settle(result, jobVerdict, jobId);
        }
      })();
    }, JOB_FALLBACK.pollMs);
    return () => window.clearInterval(timer);
  }, [jobId, jobVerdict, jobFinishing, armId, settle]);

  const homing = phase.kind === "homing";
  const startingJob = phase.kind === "homing" && phase.planned;
  const running = homing || phase.kind === "job";
  const verdict =
    phase.kind === "verdict" ||
    phase.kind === "homing" ||
    phase.kind === "job" ||
    phase.kind === "failed"
      ? phase.verdict
      : null;
  const summary = verdict ? sweepSummary(verdict) : null;
  const clear = verdict?.clear === true;
  const planKind: PrePositionKind = verdict ? prePositionKind(verdict.pre_position) : "none";
  const plan =
    verdict?.pre_position && planKind === "planned"
      ? prePositionSummary(verdict.pre_position)
      : null;
  const fold = studioFoldTarget(armId, verdict?.first_blocked_pair);

  const close = () => {
    if (running) return; // nothing in the UI stops the carriage / the arm; keep the progress visible
    onRequestClose();
  };

  const confirm = async () => {
    if (phase.kind !== "verdict" || !canConfirm(phase.verdict)) return;
    const v = phase.verdict;
    const planned = prePositionKind(v.pre_position) === "planned";
    setPhase({ kind: "homing", verdict: v, planned });
    onHomingChange?.(true);
    try {
      const result = await postArmMaintenance(armId, "home_rail", {
        dryRun: false,
        timeoutMs: HOME_RAIL_TIMEOUT_MS,
      });
      if (result.status === "accepted" && result.job_id) {
        // 202: the RailHomingJob owns the motion from here; the card stays busy
        // until the job's final result arrives (see the progress effect).
        if (aliveRef.current) {
          setPhase({ kind: "job", verdict: v, jobId: result.job_id, finishing: false });
        } else {
          onHomingChange?.(false);
        }
        return;
      }
      const { text, tone } = maintenanceToast(result);
      addToast(text, tone);
      onHomingChange?.(false);
      if (!aliveRef.current) return;
      if (result.ok) onRequestClose();
      else setPhase({ kind: "failed", verdict: v, detail: result.detail || "home_rail failed" });
    } catch (e) {
      const detail = errorDetail(e);
      addToast(`${armLabel(armId)} · ${detail}`, "error");
      onHomingChange?.(false);
      if (aliveRef.current) setPhase({ kind: "failed", verdict: v, detail });
    }
  };

  const showConfirm = (phase.kind === "verdict" && canConfirm(phase.verdict)) || homing;
  const deadEnd =
    phase.kind === "refused" ||
    phase.kind === "failed" ||
    (phase.kind === "verdict" && !canConfirm(phase.verdict));
  const confirmLabel = planKind === "planned" ? HOME_RAIL_CONFIRM_PLANNED : HOME_RAIL_CONFIRM;
  // A refused plan shows the runtime's suggestion (top-level `detail`, else the
  // plan's own `detail`, else the generic hint); a blocked verdict on a pre-09d
  // runtime shows its `detail` under the Studio hint as before.
  const refusedPlanDetail =
    planKind === "refused" && phase.kind === "verdict"
      ? phase.detail || verdict?.pre_position?.detail || PRE_POSITION_REFUSED_HINT
      : null;
  const errorText =
    phase.kind === "refused" || phase.kind === "failed"
      ? phase.detail
      : refusedPlanDetail !== null
        ? refusedPlanDetail
        : phase.kind === "verdict" && !phase.verdict.clear && planKind === "none" && phase.detail
          ? phase.detail
          : null;

  // Progress view data (phase-09d): the live frame for our job, else the last one seen.
  const jobProgress =
    phase.kind === "job"
      ? progress !== null && progress.job_id === phase.jobId
        ? progress
        : lastProgressRef.current
      : null;
  const current: MaintenanceProgress["phase"] = jobProgress?.phase ?? "queued";
  const pct = Math.round(Math.min(1, Math.max(0, jobProgress?.progress ?? 0)) * 100);

  return (
    <Sheet
      title={HOME_RAIL_TITLE}
      subtitle={`${armTitle(armId)} · ${SCENE_DISPLAY_NAME}`}
      width={480}
      open={open}
      hostTestId="home-rail-sheet"
      testId="home-rail-panel"
      closeButtonTestId="home-rail-close"
      onRequestClose={close}
      closeOnBackdrop={!running}
      closeOnEscape={!running}
      showClose={!running}
      panelProps={{ "data-arm": armId, "data-phase": phase.kind, "data-plan": planKind }}
      footerStart={
        <button
          type="button"
          className="btn-secondary"
          onClick={close}
          disabled={running}
          data-testid="home-rail-cancel"
          data-autofocus
        >
          {deadEnd ? "Close" : "Cancel"}
        </button>
      }
      footer={
        showConfirm ? (
          <button
            type="button"
            className="btn-destructive"
            disabled={homing}
            aria-busy={homing ? "true" : undefined}
            onClick={() => void confirm()}
            data-testid="home-rail-confirm"
          >
            {homing && <span className="spinner" aria-hidden="true" />}
            {homing ? (startingJob ? "Starting…" : "Homing…") : confirmLabel}
          </button>
        ) : undefined
      }
    >
      <div className="home-rail-notice" role="note" data-testid="home-rail-notice">
        <Icon name="warning" size={16} />
        <span>{HOME_RAIL_NOTICE}</span>
      </div>
      {phase.kind === "checking" && (
        <div className="home-rail-status" role="status" data-testid="home-rail-checking">
          <span className="spinner" aria-hidden="true" />
          {HOME_RAIL_CHECKING}
        </div>
      )}
      {summary && (
        <>
          <div
            className={`pill ${clear ? "pill-ok" : planKind === "planned" ? "pill-warn" : "pill-danger"} home-rail-verdict`}
            data-testid="home-rail-verdict"
            data-clear={clear ? "true" : "false"}
          >
            <Icon name={clear ? "check" : planKind === "planned" ? "warning" : "error"} size={12} />
            {summary.headline}
          </div>
          <ul className="home-rail-facts text-callout" data-testid="home-rail-facts">
            <li data-testid="home-rail-recipe">{summary.recipe}</li>
            {summary.blocked && (
              <li className="home-rail-blocked" data-testid="home-rail-blocked">
                {summary.blocked}
              </li>
            )}
            {summary.clearance && <li data-testid="home-rail-clearance">{summary.clearance}</li>}
            {summary.others.map((line) => (
              <li key={line} data-testid="home-rail-other">
                {line}
              </li>
            ))}
            {summary.assumptions.map((line) => (
              <li key={line} className="home-rail-assumption" data-testid="home-rail-assumption">
                <Icon name="info" size={12} />
                {line}
              </li>
            ))}
          </ul>
          {plan && (
            <div className="home-rail-plan" data-testid="home-rail-plan">
              <p className="text-callout home-rail-plan-text" data-testid="home-rail-plan-text">
                {plan.explanation}
              </p>
              {plan.target && (
                <p
                  className="text-callout text-mono home-rail-plan-target"
                  data-testid="home-rail-plan-target"
                >
                  {plan.target}
                </p>
              )}
              <p
                className="text-caption fg-3 home-rail-plan-check"
                data-testid="home-rail-plan-check"
              >
                {plan.validation}
              </p>
            </div>
          )}
          {!clear && phase.kind === "verdict" && planKind === "none" && (
            <p className="text-callout fg-2 home-rail-hint" data-testid="home-rail-hint">
              {HOME_RAIL_BLOCKED_HINT}
            </p>
          )}
          {!clear && phase.kind === "verdict" && planKind !== "planned" && (
            <div
              className="home-rail-plan home-rail-studio"
              role="note"
              data-testid="home-rail-studio-steps"
              data-fold-arm={fold.armId}
            >
              <p className="text-body-strong">{HOME_RAIL_STUDIO_HEADLINE}</p>
              <p className="text-callout" data-testid="home-rail-studio-target">
                {fold.other
                  ? `The ${armLabel(fold.armId)} is in the way: fold the ${armLabel(fold.armId)} first (or both arms).`
                  : `Fold the ${armLabel(armId)}.`}
              </p>
              <ol className="text-callout home-rail-studio-steps">
                {HOME_RAIL_STUDIO_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
      {homing && (
        <div
          className="home-rail-status"
          role="status"
          aria-live="polite"
          data-testid="home-rail-homing"
        >
          <span className="spinner" aria-hidden="true" />
          {startingJob ? HOME_RAIL_JOB_STARTING : HOME_RAIL_HOMING}
        </div>
      )}
      {phase.kind === "job" && (
        <div
          className="home-rail-job"
          role="status"
          aria-live="polite"
          data-testid="home-rail-job"
          data-job-id={phase.jobId}
          data-job-phase={current}
        >
          <div className="home-rail-job-head">
            {isTerminalPhase(current) ? (
              <Icon name={current === "done" ? "check" : "error"} size={16} />
            ) : (
              <span className="spinner" aria-hidden="true" />
            )}
            <span className="text-body-strong">{HOME_RAIL_JOB_HEADLINE}</span>
          </div>
          <ol className="home-rail-phases">
            {MAINTENANCE_PHASES.map((p) => {
              const state = phaseState(p, current, lastActiveRef.current);
              return (
                <li
                  key={p}
                  className="home-rail-phase"
                  data-state={state}
                  data-testid={`home-rail-phase-${p}`}
                >
                  <span className="home-rail-phase-glyph" aria-hidden="true">
                    {state === "done" ? (
                      <Icon name="check" size={14} />
                    ) : state === "failed" ? (
                      <Icon name="error" size={14} />
                    ) : state === "active" ? (
                      <span className="spinner" />
                    ) : (
                      <span className="home-rail-phase-dot" />
                    )}
                  </span>
                  <span className="home-rail-phase-label">{PHASE_LABELS[p]}</span>
                  {(state === "active" || state === "failed") && jobProgress?.detail && (
                    <span
                      className="home-rail-phase-detail fg-2"
                      data-testid="home-rail-job-detail"
                    >
                      {jobProgress.detail}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <div
            className="home-rail-progress"
            role="progressbar"
            aria-label="rail homing job progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            data-testid="home-rail-progress"
          >
            <div className="home-rail-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          {phase.finishing && (
            <div className="home-rail-status" data-testid="home-rail-job-finishing">
              <span className="spinner" aria-hidden="true" />
              {HOME_RAIL_JOB_FINISHING}
            </div>
          )}
        </div>
      )}
      {errorText !== null && (
        <div className="sheet-error" role="alert" data-testid="home-rail-error">
          <Icon name="error" size={16} />
          <span>{errorText}</span>
        </div>
      )}
    </Sheet>
  );
}
