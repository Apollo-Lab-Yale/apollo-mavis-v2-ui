/** OnlineDaggerPanel (phase-14; 15-online-dagger §8 Cockpit): the dagger side panel
 * while `telemetry.dagger.online_dagger` is set. The runtime is the
 * algorithm-agnostic shell, so the panel shows rollout-level state and relays what
 * the trainer says — it names no DAgger variant. Everything renders from telemetry
 * through the pure `onlineDaggerModel` reducer (tested on its own):
 *
 *  - header row: **n rollouts saved** (tabular numerals) · the phase pill
 *    (`waiting_trainer` amber "WAITING FOR TRAINER", `rollout` blue "ROLLOUT",
 *    `training` accent "TRAINING [p %]" with a thin progressbar from
 *    `trainer.progress`, `error` danger "TRAINER ERROR — detail", the detail being
 *    the trainer's own sentence, never the runtime's `trainer error:` refusal
 *    prefix) — colour always with a word;
 *  - the existing control-mode chip (POLICY DRIVING / HUMAN TAKEOVER / TRANSITION)
 *    and the external-policy chip;
 *  - trainer state + detail, then its free-form `metrics` as a generic key / value
 *    list (tabular numerals) — a metric named `loss` GETS the 60-point sparkline
 *    canvas (`useLossHistory`: a store subscription appends a point per new trainer
 *    sample, repainted on requestAnimationFrame, never CSS-animated data); without
 *    one there is no sparkline;
 *  - the session's actor split (expert / novice frames — the ONLY place it renders,
 *    EpisodeControls carries just the new-episode reason) and the acting policy
 *    version (a "swapped" note for 1.2 s on change — opacity only, no bounce);
 *  - actions: **Take over** / **Hand back** (`takeover` / `handback`; the runtime
 *    accepts both at ANY time and acks idempotently, so — like the Space toggle
 *    beside them — only the control mode decides which one is live: the disabled
 *    one names its no-op, an observer / a down link disables both with THAT
 *    reason), **Train now** (`train_now`; disabled with a reason while an episode
 *    is open, without a fresh trainer status or while the trainer trains; the ack
 *    toasts), and the key hints via `codeForAction` (takeover toggle, N / Enter /
 *    Backspace — the N hint greys out while `newRolloutReason` says the runtime
 *    would refuse `episode_new`).
 *
 * `newRolloutReason` is the shared phase gate (15-online-dagger §3), in the
 * runtime's own order (`_refuse_locked`): a trainer that is not alive refuses first
 * — whatever the phase says, the coordinator's phase is a function of the LAST
 * status and stays `rollout` when the trainer dies — then everything outside
 * `rollout`. The Cockpit disables EpisodeControls' New episode with the same text
 * instead of letting the operator meet the nack toast.
 *
 * `OnlineDaggerBanner` (rendered by the Cockpit in `.cockpit-main`) is the red
 * banner for a dead or erroring trainer. Freshness is the RUNTIME's call
 * (`trainer_alive`, its `dora.policy.spec_stale_s` window): the UI keeps no window
 * of its own, so it can never say STALE while the runtime says alive. */
import { useEffect, useRef, useState } from "react";
import { onAck } from "../api/clients";
import type {
  DaggerStatus,
  EpisodeStatus,
  ExternalStatus,
  OnlineDaggerStatus,
  TrainerStatusAnnounce,
} from "../gen";
import { codeForAction, keycapLabel, type Bindings } from "../input/bindings";
import type { ActionName } from "../lib/types";
import { useStore } from "../store";
import { ExternalPolicyChip } from "./externalPolicy";

export type OnlineDaggerPhase = OnlineDaggerStatus["phase"];
export type PhaseTone = "amber" | "blue" | "accent" | "danger";

/** How long the "swapped" note stays after the acting policy version changed. */
export const SWAPPED_NOTE_MS = 1200;
/** Points kept by the loss sparkline. */
export const SPARKLINE_POINTS = 60;
/** The metric key the sparkline follows (15-online-dagger §8). */
export const LOSS_METRIC = "loss";

export interface ActionGate {
  disabled: boolean;
  reason: string | null;
}

export interface MetricRow {
  key: string;
  value: number;
}

export interface OnlineDaggerModel {
  title: string;
  rolloutsSaved: number;
  phase: { kind: OnlineDaggerPhase; tone: PhaseTone; label: string; progress: number | null };
  controlChip: { tone: "blue" | "green" | "amber"; label: string };
  trainer: {
    id: string | null;
    state: TrainerStatusAnnounce["state"] | null;
    detail: string;
    alive: boolean;
    ageS: number | null;
  };
  /** The trainer's `metrics` verbatim (finite numbers only, wire order). */
  metrics: MetricRow[];
  /** `metrics.loss` when finite — what the sparkline plots. */
  loss: number | null;
  /** This SESSION's kept frames by actor. */
  actorSplit: { expert: number; novice: number };
  policyVersion: number | null;
  takeover: ActionGate;
  handback: ActionGate;
  /** One line under the Take over / Hand back pair: their shared reason when both
   * are off, else the disabled one's reason prefixed with its label; null when
   * both are live. */
  gateReason: string | null;
  trainNow: ActionGate;
  /** Red banner text, or null when the trainer is alive (the runtime's freshness
   * window) and not erroring. */
  banner: string | null;
  detail: string;
}

export interface PanelSession {
  episode: EpisodeStatus | null;
  /** Control link down (every action disabled). */
  controlDown?: boolean;
  /** Observer role — another client controls the session (every action disabled,
   * with THAT reason: the link may well be up). */
  readOnly?: boolean;
}

/** Why the runtime refuses `episode_new` in each non-`rollout` phase
 * (15-online-dagger §3) — the fallback wording when telemetry's `detail` is
 * empty; the detail itself ("waiting for the trainer to report ready (loading the
 * offline pool)", "training in progress (epoch 3/8)") is preferred when present. */
export const PHASE_BLOCK_REASON: Record<Exclude<OnlineDaggerPhase, "rollout">, string> = {
  waiting_trainer: "waiting for the trainer to report ready",
  training: "training in progress",
  error: "trainer error — recover it or end the session",
};

/** The reason a new rollout cannot start right now, or null while the trainer is
 * alive and the coordinator is in `rollout` (or the session is not Online DAgger at
 * all). Mirrors the runtime's `_refuse_locked` order: aliveness FIRST — the phase
 * stays whatever the last status made it when the trainer dies, so `rollout` alone
 * proves nothing — then the phase. Shared by EpisodeControls' New episode button
 * and the panel's N hint. */
export function newRolloutReason(od: OnlineDaggerStatus | null | undefined): string | null {
  if (!od) return null;
  if (od.trainer_alive === false || !od.trainer) return od.detail || REASON_NO_TRAINER;
  if (od.phase === "rollout") return null;
  return od.detail || PHASE_BLOCK_REASON[od.phase];
}

export const REASON_OBSERVER = "observer — another client controls this session";
export const REASON_LINK_DOWN = "control link down";
export const REASON_ALREADY_HUMAN = "already taken over";
export const REASON_ALREADY_POLICY = "the policy is already driving";
export const REASON_EPISODE_OPEN = "save or discard the episode first";
export const REASON_RETURNING = "wait for the return to start to finish";
export const REASON_NO_TRAINER = "no Online DAgger trainer attached";

const CONTROL_CHIP: Record<DaggerStatus["control_mode"], OnlineDaggerModel["controlChip"]> = {
  policy: { tone: "blue", label: "POLICY DRIVING" },
  human: { tone: "green", label: "HUMAN TAKEOVER — recording intervention" },
  takeover_transition: { tone: "amber", label: "TRANSITION — frames unlabeled" },
};

const fmtAge = (s: number | null | undefined): string =>
  s == null || !Number.isFinite(s) ? "?" : s >= 10 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

function phaseModel(
  od: OnlineDaggerStatus,
  trainer: TrainerStatusAnnounce | null,
): OnlineDaggerModel["phase"] {
  switch (od.phase) {
    case "waiting_trainer":
      return {
        kind: "waiting_trainer",
        tone: "amber",
        label: "WAITING FOR TRAINER",
        progress: null,
      };
    case "rollout":
      return { kind: "rollout", tone: "blue", label: "ROLLOUT", progress: null };
    case "training": {
      // `progress` defaults to 0 on the wire: a trainer that reports none shows a
      // plain "TRAINING" with an indeterminate bar rather than a frozen "0 %".
      const raw = trainer?.progress;
      const p = raw != null && Number.isFinite(raw) && raw > 0 ? clamp01(raw) : null;
      return {
        kind: "training",
        tone: "accent",
        label: `TRAINING${p == null ? "" : ` ${Math.round(p * 100)} %`}`,
        progress: p,
      };
    }
    case "error":
    default: {
      // The runtime's `detail` in this phase is its `episode_new` refusal, "trainer
      // error: <detail>" (`_refuse_locked`); the pill wants the trainer's sentence
      // itself, as the banner shows it — so prefer the trainer's own detail and strip
      // the refusal prefix from the runtime's.
      const detail =
        (trainer?.state === "error" ? trainer.detail : "") ||
        (od.detail || "").replace(/^trainer error:\s*/, "") ||
        trainer?.detail ||
        "";
      return {
        kind: "error",
        tone: "danger",
        label: `TRAINER ERROR${detail ? ` — ${detail}` : ""}`,
        progress: null,
      };
    }
  }
}

const off = (reason: string): ActionGate => ({ disabled: true, reason });
const LIVE: ActionGate = { disabled: false, reason: null };

/** The reasons every action shares, in order: the role, then the link. */
function commonReason(session: PanelSession): string | null {
  if (session.readOnly) return REASON_OBSERVER;
  if (session.controlDown) return REASON_LINK_DOWN;
  return null;
}

/** Take over / Hand back follow the RUNTIME (`_op_takeover` / `_op_handback`): both
 * are accepted in every episode state — between rollouts, while saving, and during
 * `returning`, where a take-over is the documented escape (the return is cancelled
 * by any input) — exactly like the Space toggle whose hint sits beside them. Only
 * the control mode decides which one is a no-op ack. */
function takeoverModel(dagger: DaggerStatus, session: PanelSession): ActionGate {
  const common = commonReason(session);
  if (common) return off(common);
  // `takeover` in HUMAN / TRANSITION is a no-op ack server-side (15-online-dagger §3).
  if (dagger.control_mode !== "policy") return off(REASON_ALREADY_HUMAN);
  return LIVE;
}

function handbackModel(dagger: DaggerStatus, session: PanelSession): ActionGate {
  const common = commonReason(session);
  if (common) return off(common);
  // `handback` in POLICY is a no-op ack server-side.
  if (dagger.control_mode === "policy") return off(REASON_ALREADY_POLICY);
  return LIVE;
}

function gateReasonLine(takeover: ActionGate, handback: ActionGate): string | null {
  if (takeover.disabled && handback.disabled) return takeover.reason;
  if (takeover.disabled) return `Take over: ${takeover.reason}`;
  if (handback.disabled) return `Hand back: ${handback.reason}`;
  return null;
}

function trainNowModel(od: OnlineDaggerStatus, session: PanelSession): ActionGate {
  const common = commonReason(session);
  if (common) return off(common);
  const ep = session.episode?.state ?? "idle";
  if (ep === "recording" || ep === "saving") return off(REASON_EPISODE_OPEN);
  if (ep === "returning") return off(REASON_RETURNING);
  if (od.trainer_alive === false || !od.trainer) return off(REASON_NO_TRAINER);
  if (od.phase === "training") return off(PHASE_BLOCK_REASON.training);
  return LIVE;
}

function bannerText(od: OnlineDaggerStatus, trainer: TrainerStatusAnnounce | null): string | null {
  const age = od.trainer_age_s ?? null;
  if (od.trainer_alive === false) {
    if (!trainer)
      return "ONLINE DAGGER TRAINER MISSING — no policy node has reported trainer status";
    return `ONLINE DAGGER TRAINER LOST — no status from ${trainer.trainer_id} for ${fmtAge(age)}`;
  }
  if (od.phase === "error" || trainer?.state === "error") {
    const detail =
      trainer?.state === "error"
        ? trainer.detail
        : (od.detail || "").replace(/^trainer error:\s*/, "");
    return `ONLINE DAGGER TRAINER ERROR${detail ? ` — ${detail}` : ""}`;
  }
  // Staleness is the runtime's call: `trainer_alive` already folds its
  // `spec_stale_s` window in, so an alive trainer is never called stale here.
  return null;
}

/** The trainer's `metrics` as rows: finite numbers only, in the order the trainer
 * sent them (the runtime relays the dict verbatim). */
export function metricRows(trainer: TrainerStatusAnnounce | null | undefined): MetricRow[] {
  const m = trainer?.metrics;
  if (!m) return [];
  return Object.entries(m)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .map(([key, value]) => ({ key, value }));
}

/** `metrics.loss` when it is a finite number, else null. */
export function lossOf(trainer: TrainerStatusAnnounce | null | undefined): number | null {
  const v = trainer?.metrics?.[LOSS_METRIC];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Pure reducer: telemetry → everything the panel and the banner render. */
export function onlineDaggerModel(
  dagger: DaggerStatus,
  session: PanelSession,
): OnlineDaggerModel | null {
  const od = dagger.online_dagger;
  if (!od) return null;
  const trainer = od.trainer ?? null;
  const takeover = takeoverModel(dagger, session);
  const handback = handbackModel(dagger, session);
  return {
    title: `Online DAgger · ${od.session_name}`,
    rolloutsSaved: od.rollouts_saved,
    phase: phaseModel(od, trainer),
    controlChip: CONTROL_CHIP[dagger.control_mode],
    trainer: {
      id: trainer?.trainer_id ?? null,
      state: trainer?.state ?? null,
      detail: trainer?.detail ?? "",
      alive: od.trainer_alive !== false && trainer !== null,
      ageS: od.trainer_age_s ?? null,
    },
    metrics: metricRows(trainer),
    loss: lossOf(trainer),
    actorSplit: {
      expert: od.expert_frames_session ?? 0,
      novice: od.novice_frames_session ?? 0,
    },
    policyVersion: od.policy_version_acting ?? null,
    takeover,
    handback,
    gateReason: gateReasonLine(takeover, handback),
    trainNow: trainNowModel(od, session),
    banner: bannerText(od, trainer),
    detail: od.detail ?? "",
  };
}

/** A metric value for the list: integers verbatim, large values to one decimal,
 * everything else to three significant digits. */
export const fmtMetric = (v: number): string =>
  !Number.isFinite(v)
    ? "—"
    : Number.isInteger(v)
      ? String(v)
      : Math.abs(v) >= 100
        ? v.toFixed(1)
        : v.toPrecision(3);

const PHASE_CHIP: Record<PhaseTone, string> = {
  amber: "chip chip-amber",
  blue: "chip chip-blue",
  accent: "chip chip-accent",
  danger: "chip chip-red",
};

/** The loss history behind the sparkline: a ring of the last `points` DISTINCT
 * `metrics.loss` samples. Stable for the hook's lifetime (`points` is read once);
 * `count` / `at` are read by the drawing effect. */
export interface LossRing {
  readonly points: number;
  /** Points collected so far (≤ `points`). */
  count: number;
  /** The i-th oldest kept value, 0 ≤ i < count. */
  at(i: number): number;
}

function makeLossRing(points: number): LossRing & {
  buf: Float64Array;
  head: number;
  lastKey: string;
} {
  const ring = {
    points,
    buf: new Float64Array(points),
    head: 0,
    count: 0,
    lastKey: "",
    at(i: number): number {
      return ring.buf[(ring.head - ring.count + i + points) % points] ?? 0;
    },
  };
  return ring;
}

/** `metrics.loss` over the last `points` trainer samples, fed by store telemetry.
 * Telemetry replaces the whole message 20–30× a second, so the samples live in a
 * ring outside React state; a point is appended whenever the trainer's (policy
 * version, progress, loss) triple changes — at most the trainer's status rate — and
 * ONLY then does `version` bump, so the component knows the count from a render
 * value rather than from a DOM side-channel and never re-renders per frame. */
export function useLossHistory(points = SPARKLINE_POINTS): { ring: LossRing; version: number } {
  const [ring] = useState(() => makeLossRing(points));
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const ingest = (trainer: TrainerStatusAnnounce | null | undefined) => {
      const loss = lossOf(trainer);
      if (!trainer || loss == null) return;
      const key = `${trainer.policy_version ?? 0}:${trainer.progress ?? 0}:${loss}`;
      if (key === ring.lastKey) return;
      ring.lastKey = key;
      ring.buf[ring.head] = loss;
      ring.head = (ring.head + 1) % ring.points;
      if (ring.count < ring.points) ring.count += 1;
      setVersion((v) => v + 1);
    };
    ingest(useStore.getState().telemetry?.dagger?.online_dagger?.trainer);
    return useStore.subscribe((s, prev) => {
      if (s.telemetry === prev.telemetry) return;
      ingest(s.telemetry?.dagger?.online_dagger?.trainer);
    });
  }, [ring]);
  return { ring, version };
}

export interface LossSparklineProps {
  /** The trainer's current `metrics.loss` (`onlineDaggerModel().loss`): null when the
   * trainer reports none — then, until a point has been collected, there is NO
   * sparkline (15-online-dagger §8: a `loss` metric GETS one). */
  loss: number | null;
  points?: number;
}

/** The 60-point loss sparkline canvas, repainted on requestAnimationFrame when a
 * point arrives or the tab becomes visible again. Renders nothing while the trainer
 * has never reported a `loss`. */
export function LossSparkline({ loss, points = SPARKLINE_POINTS }: LossSparklineProps) {
  const { ring, version } = useLossHistory(points);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shown = loss !== null || ring.count > 0;
  useEffect(() => {
    if (!shown) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf: number | null = null;
    // Both colours come from the design tokens (`--border` follows the theme and is
    // promoted to `--border-strong` under `prefers-contrast: more`).
    const colors = () => {
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(canvas) : null;
      const v = (name: string, fallback: string) => cs?.getPropertyValue(name).trim() || fallback;
      return { accent: v("--accent", "#5ac8fa"), grid: v("--border", "rgba(255, 255, 255, 0.08)") };
    };
    const draw = () => {
      raf = null;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      const c = colors();
      const count = ring.count;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = c.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h - 0.5);
      ctx.lineTo(w, h - 0.5);
      ctx.stroke();
      if (count < 2) return;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < count; i += 1) {
        const v = ring.at(i);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const span = hi - lo || 1;
      const pad = 2;
      const px = (i: number) => (w * i) / (points - 1) + (w * (points - count)) / (points - 1);
      const py = (v: number) => h - pad - ((v - lo) / span) * (h - 2 * pad);
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const x = px(i);
        const y = py(ring.at(i));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.arc(px(count - 1), py(ring.at(count - 1)), 2, 0, Math.PI * 2);
      ctx.fill();
    };
    const schedule = () => {
      if (raf != null) return;
      if (typeof document !== "undefined" && document.hidden) return;
      raf = requestAnimationFrame(draw);
    };
    schedule();
    const onVisibility = () => {
      if (!document.hidden) schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [shown, ring, version, points]);
  if (!shown) return null;
  return (
    <canvas
      ref={canvasRef}
      width={180}
      height={36}
      className="od-sparkline"
      role="img"
      aria-label={
        ring.count > 0
          ? `training loss, last ${points} samples`
          : "training loss — no loss reported yet"
      }
      data-count={ring.count}
      data-testid="od-loss-sparkline"
    />
  );
}

export interface OnlineDaggerPanelProps {
  dagger: DaggerStatus;
  /** `telemetry.external` (phase-12): drives the additive external-policy chip. */
  external?: ExternalStatus | null;
  episode: EpisodeStatus | null;
  bindings: Bindings | null;
  onAction(n: ActionName): void;
  /** Control link down. */
  disabled?: boolean;
  /** Observer role: another client controls the session. */
  readOnly?: boolean;
}

function kbdFor(bindings: Bindings | null, action: ActionName): string | null {
  const code = bindings ? codeForAction(bindings, action) : null;
  return code ? keycapLabel(code) : null;
}

export function OnlineDaggerPanel({
  dagger,
  external,
  episode,
  bindings,
  onAction,
  disabled = false,
  readOnly = false,
}: OnlineDaggerPanelProps) {
  const model = onlineDaggerModel(dagger, { episode, controlDown: disabled, readOnly });
  const addToast = useStore((s) => s.addToast);
  // "swapped" note: shown for SWAPPED_NOTE_MS after the acting version changed.
  const version = model?.policyVersion ?? null;
  const prevVersion = useRef<number | null>(version);
  const [swapped, setSwapped] = useState(false);
  useEffect(() => {
    if (prevVersion.current === version) return;
    const first = prevVersion.current === null;
    prevVersion.current = version;
    if (first || version === null) return;
    setSwapped(true);
    const id = window.setTimeout(() => setSwapped(false), SWAPPED_NOTE_MS);
    return () => window.clearTimeout(id);
  }, [version]);
  // The runtime answers Train now with an ack whose detail says what happened (the
  // request was published to the trainer / refused with the reason) — both are
  // worth a toast; a nack's generic toast is suppressed in favour of this one. The
  // trainer may still ignore the request (15-online-dagger §3); its state pill says.
  useEffect(
    () =>
      onAck((a) => {
        if (a.name !== "train_now") return;
        addToast(
          a.ok
            ? a.detail || "Train now sent — the trainer decides whether to act on it"
            : `Train now refused: ${a.detail || "no detail"}`,
          a.ok ? "info" : "warning",
        );
        return true;
      }),
    [addToast],
  );
  if (!model) return null;
  const { phase, trainer, takeover, handback, trainNow } = model;
  const takeoverKey = kbdFor(bindings, "takeover_toggle");
  const epNew = kbdFor(bindings, "episode_new");
  const epSave = kbdFor(bindings, "episode_save");
  const epDiscard = kbdFor(bindings, "episode_discard");
  // The N hint greys out while the runtime would refuse a new rollout (same gate as
  // EpisodeControls' New episode button).
  const newBlocked = newRolloutReason(dagger.online_dagger);
  const n = model.rolloutsSaved;
  return (
    <div className="panel od-panel" data-testid="online-dagger-panel" data-phase={phase.kind}>
      <div className="od-head">
        <span className="od-rollouts tabular" data-testid="od-rollouts">
          <strong>{n}</strong>
          <span className="fg-2"> {n === 1 ? "rollout" : "rollouts"} saved</span>
        </span>
        <span
          className={`${PHASE_CHIP[phase.tone]} od-phase`}
          data-testid="od-phase"
          data-phase={phase.kind}
        >
          {phase.label}
        </span>
      </div>
      {phase.kind === "training" && (
        <div
          className="home-rail-progress od-progress"
          role="progressbar"
          aria-label="training progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={phase.progress == null ? undefined : Math.round(phase.progress * 100)}
          data-testid="od-training-progress"
        >
          <div
            className="home-rail-progress-fill"
            style={{ width: `${Math.round((phase.progress ?? 0) * 100)}%` }}
          />
        </div>
      )}
      {model.detail && phase.kind !== "error" && (
        <div className="text-caption fg-3 od-detail" data-testid="od-detail">
          {model.detail}
        </div>
      )}
      <div className="od-chips">
        <span className={`chip chip-${model.controlChip.tone}`} data-testid="dagger-mode-chip">
          {model.controlChip.label}
        </span>
        <ExternalPolicyChip external={external} policyStale={dagger.policy_stale} />
      </div>

      <div className="od-trainer" data-testid="od-trainer" data-alive={trainer.alive}>
        <span className="text-label fg-3">trainer</span>
        <span
          className="text-mono od-trainer-state"
          data-testid="od-trainer-state"
          data-state={trainer.state ?? undefined}
        >
          {trainer.state ?? "—"}
          {trainer.id && <span className="fg-3"> · {trainer.id}</span>}
        </span>
        {trainer.detail && (
          <span className="text-caption fg-3 od-trainer-detail" data-testid="od-trainer-detail">
            {trainer.detail}
          </span>
        )}
      </div>

      <div className="od-metrics" data-testid="od-metrics" data-count={model.metrics.length}>
        {model.metrics.length > 0 ? (
          <dl className="od-metric-list" aria-label="trainer metrics">
            {model.metrics.map((m) => (
              <div key={m.key} className="od-metric" data-testid={`od-metric-${m.key}`}>
                <dt className="text-label fg-3">{m.key}</dt>
                <dd className="text-mono tabular">{fmtMetric(m.value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <span className="text-caption fg-3" data-testid="od-metrics-empty">
            no metrics reported by the trainer yet
          </span>
        )}
        <LossSparkline loss={model.loss} />
      </div>

      <div className="od-meters">
        <div className="od-meter">
          <span className="text-label fg-3">expert frames · session</span>
          <span className="text-mono tabular od-meter-value" data-testid="od-expert-frames">
            {model.actorSplit.expert}
            <span className="fg-3"> / {model.actorSplit.novice} novice</span>
          </span>
        </div>
        <div className="od-meter">
          <span className="text-label fg-3">acting policy</span>
          <span
            className={`text-mono tabular od-meter-value od-version${swapped ? " is-swapped" : ""}`}
            data-testid="od-policy-version"
            data-swapped={swapped ? "true" : undefined}
          >
            {model.policyVersion == null ? "—" : `v${model.policyVersion}`}
            {swapped && (
              <span className="pill pill-accent od-swapped" data-testid="od-swapped">
                swapped
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="od-actions">
        <div className="od-buttons">
          <button
            type="button"
            className="btn-secondary"
            disabled={takeover.disabled}
            aria-describedby={takeover.disabled && model.gateReason ? "od-gate-reason" : undefined}
            onClick={() => onAction("takeover")}
            data-testid="od-takeover"
          >
            Take over
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={handback.disabled}
            aria-describedby={handback.disabled && model.gateReason ? "od-gate-reason" : undefined}
            onClick={() => onAction("handback")}
            data-testid="od-handback"
          >
            Hand back
          </button>
        </div>
        {model.gateReason && (
          <span className="btn-reason" id="od-gate-reason" data-testid="od-gate-reason">
            {model.gateReason}
          </span>
        )}
        <div className="od-buttons">
          <button
            type="button"
            className="btn-secondary"
            disabled={trainNow.disabled}
            aria-describedby={trainNow.reason ? "od-train-now-reason" : undefined}
            onClick={() => onAction("train_now")}
            data-testid="od-train-now"
          >
            Train now
          </button>
        </div>
        {trainNow.reason && (
          <span className="btn-reason" id="od-train-now-reason" data-testid="od-train-now-reason">
            {trainNow.reason}
          </span>
        )}
      </div>
      <div className="dim od-hints" data-testid="od-hints">
        {takeoverKey && (
          <span>
            <kbd>{takeoverKey}</kbd> takeover toggle
          </span>
        )}
        {epNew && (
          <span
            className={newBlocked !== null ? "od-hint-off" : undefined}
            aria-disabled={newBlocked !== null ? "true" : undefined}
            title={newBlocked ?? undefined}
            data-testid="od-hint-new"
          >
            <kbd>{epNew}</kbd> new rollout
          </span>
        )}
        {epSave && (
          <span>
            <kbd>{epSave}</kbd> keep
          </span>
        )}
        {epDiscard && (
          <span>
            <kbd>{epDiscard}</kbd> discard
          </span>
        )}
      </div>
    </div>
  );
}

export interface OnlineDaggerBannerProps {
  dagger: DaggerStatus;
}

/** Red banner in `.cockpit-main` while the trainer is dead (as the runtime judges
 * it) or erroring. */
export function OnlineDaggerBanner({ dagger }: OnlineDaggerBannerProps) {
  const model = onlineDaggerModel(dagger, { episode: null });
  if (!model?.banner) return null;
  return (
    <div className="banner banner-red" role="alert" data-testid="online-dagger-banner">
      {model.banner}
    </div>
  );
}
