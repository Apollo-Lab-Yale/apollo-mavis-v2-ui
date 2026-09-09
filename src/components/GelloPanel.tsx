/** GelloPanel (phase-15; 16-gello §11 Cockpit): the side panel of a GELLO
 * Manipulation session, fed by `telemetry.gello` (`GelloTelemetry`, 16-gello §8.3).
 * Everything renders from telemetry through the pure `gelloPanelModel` reducer
 * (tested on its own):
 *
 *  - the engagement state chip (16-gello §6.1 / D3): `TRACKING` green (the follower
 *    streams the leader), `OUT OF SYNC` amber with the per-joint Δ bars from
 *    `lag_rad` (the leader is farther than the engage tolerance from the arm, or the
 *    leash tripped — bring GELLO back within tolerance and it re-engages by itself),
 *    `PAUSED` grey (the operator's Pause, a fault, or an R / Go to profile motion
 *    just ended — only **Resume** leaves it), `NO LEADER` red (no fresh / valid
 *    sample — the arm holds its last command), `MOTION` blue (a twin-planned motion
 *    owns the arm); colour always with a word. The runtime's engage machine ranks
 *    them `motion` > `paused` > `no_leader` > the engage rule, so a latched pause
 *    always READS `paused` — a lost leader never hides one;
 *  - **Pause** / **Resume** (`gello_pause` / `gello_resume`, idempotent — 16-gello
 *    D9: Cockpit buttons, no key, the keymap is operator-owned); the disabled one
 *    names its no-op, an observer / a down link disables both with THAT reason.
 *    During `motion` Pause stays LIVE: the runtime latches it and the state turns
 *    `paused` when the window closes (`paused_latched` shows the latch as a caption
 *    and disables Pause as "already paused (latched)"); Resume is refused there
 *    ("Resume after the motion ends" — the runtime nacks it). The launch motion is
 *    NOT preceded by a pause: unless the operator latches one the follower engages
 *    on arrival (2026-09-09 review);
 *  - leader rows: status, sample age, rate, gripper fraction, max lag;
 *  - the viewpoint row (`GelloTelemetry.viewpoint`, 16-gello §7): `external node
 *    <id> attached` / `holding the GELLO posture` (auto, nothing attached) / `waiting
 *    for a viewpoint node` (external, nothing attached) / `viewpoint disabled (hold)`;
 *    `viewpoint.paused` (the three-strike NaN guard paused the source while
 *    `attached` stays true) renders AMBER with the runtime's detail ("paused after 3
 *    NaN actions - press Resume") and keeps **Resume** live whatever the follower
 *    state — `gello_resume` lifts that pause even while the follower tracks
 *    (2026-09-09 review);
 *  - the key hints (`R`, ←/→) via `codeForAction` — never hard-coded.
 *
 * `GelloBanner` (rendered by the Cockpit in `.cockpit-main`) is the red banner while
 * the leader is lost during the session — keyed on the DEVICE status (`status !==
 * "connected"`) or the `no_leader` state, so it survives a pause: the Manipulation
 * Arm is not following, and the operator must know before they touch GELLO again. */
import type { ExternalStatus, GelloTelemetry, GelloViewpointTelemetry } from "../gen";
import { codeForAction, keycapLabel, type Bindings } from "../input/bindings";
import type { ActionName } from "../lib/types";
import { ExternalPolicyChip } from "./externalPolicy";
import { REASON_LINK_DOWN, REASON_OBSERVER, type ActionGate } from "./OnlineDaggerPanel";

export type GelloState = NonNullable<GelloTelemetry["state"]>;
export type GelloTone = "green" | "amber" | "grey" | "red" | "blue";

/** |Δ| at which a lag bar is full (the leash is 0.80 rad, the engage tolerance 0.10). */
export const LAG_BAR_FULL_RAD = 0.5;

export const REASON_ALREADY_PAUSED = "already paused";
/** Pause during `motion` once the runtime reports the latch (`paused_latched`). */
export const REASON_PAUSE_LATCHED = "already paused (latched)";
export const REASON_NOT_PAUSED = "not paused";
export const REASON_ALREADY_TRACKING = "already tracking";
export const REASON_OUT_OF_SYNC_AUTO =
  "not paused — re-engages by itself once GELLO is back within tolerance";
/** Resume during `motion`: the runtime nacks it ("planned motion in progress"). */
export const REASON_RESUME_AFTER_MOTION = "Resume after the motion ends";
export const REASON_NO_SESSION_HALF = "no GELLO session state yet";
/** Caption under the chip while `paused_latched` is true (state still `motion`). */
export const LATCHED_CAPTION = "pause latched — takes effect when the motion ends";
/** The viewpoint row while `viewpoint.paused` (the runtime's detail follows it). */
export const VIEWPOINT_PAUSED_TEXT = "viewpoint paused — the Perception Arm holds";

/** What the state chip says for each `GelloTelemetry.state`. */
export const STATE_CHIP: Record<GelloState, { tone: GelloTone; label: string }> = {
  tracking: { tone: "green", label: "TRACKING" },
  out_of_sync: { tone: "amber", label: "OUT OF SYNC" },
  paused: { tone: "grey", label: "PAUSED" },
  no_leader: { tone: "red", label: "NO LEADER" },
  motion: { tone: "blue", label: "MOTION" },
};

export interface LagRow {
  joint: string;
  rad: number;
  /** |rad| / LAG_BAR_FULL_RAD, clipped to [0, 1]. */
  frac: number;
}

export interface GelloPanelModel {
  state: GelloState | null;
  chip: { tone: GelloTone; label: string };
  /** `state_detail` (the runtime's own sentence), "" when none. */
  detail: string;
  /** Per-joint Δ bars — only while OUT OF SYNC and `lag_rad` is present. */
  lag: LagRow[];
  leader: {
    status: GelloTelemetry["status"];
    backend: GelloTelemetry["backend"];
    ageMs: number | null;
    rateHz: number;
    gripperPct: number | null;
    maxLagRad: number | null;
    detail: string;
  };
  viewpoint: string;
  /** `viewpoint.paused` — the source is paused by the NaN guard (amber row, Resume live). */
  viewpointPaused: boolean;
  /** `paused_latched` — a pause latched during the current motion window. */
  latched: boolean;
  pause: ActionGate;
  resume: ActionGate;
  /** Red banner text, or null. */
  banner: string | null;
}

export interface PanelSession {
  /** Control link down (every action disabled). */
  controlDown?: boolean;
  /** Observer role — another client controls the session. */
  readOnly?: boolean;
}

/** The viewpoint row (16-gello §11). A paused source (`viewpoint.paused`, the
 * three-strike NaN guard) outranks the attached / holding wording: the node is still
 * attached, but the Perception Arm is NOT moving until Resume. */
export function viewpointText(vp: GelloViewpointTelemetry | null | undefined): string {
  if (!vp) return "—";
  if (vp.paused) return `${VIEWPOINT_PAUSED_TEXT}${vp.policy_id ? ` (node ${vp.policy_id})` : ""}`;
  if (vp.mode === "hold") return "viewpoint disabled (hold)";
  if (vp.attached) return `external node ${vp.policy_id ?? "?"} attached`;
  return vp.mode === "external" ? "waiting for a viewpoint node" : "holding the GELLO posture";
}

/** Why Pause cannot be sent (null = live). Live in `motion` — the runtime accepts
 * `gello_pause` during a motion window and latches it (the state stays `motion` and
 * becomes `paused` when the window closes) — until the runtime reports the latch
 * (`latched` = `paused_latched`); live in `no_leader` too (a pause latched while the
 * leader is lost keeps the arm from re-engaging when the leader returns). */
export function pauseReason(
  state: GelloState | null,
  s: PanelSession,
  latched = false,
): string | null {
  if (s.readOnly) return REASON_OBSERVER;
  if (s.controlDown) return REASON_LINK_DOWN;
  if (state === null) return REASON_NO_SESSION_HALF;
  if (state === "paused") return REASON_ALREADY_PAUSED;
  if (state === "motion" && latched) return REASON_PAUSE_LATCHED;
  return null;
}

/** Why Resume cannot be sent (null = live). `motion` first: the runtime nacks
 * `gello_resume` inside a motion window whatever else is pending. Then a paused
 * VIEWPOINT source (`viewpointPaused` = `viewpoint.paused`) keeps Resume live in
 * every follower state — `gello_resume` lifts that pause even while the follower
 * tracks, and nothing else does (2026-09-09 review). The engage machine ranks
 * `motion` > `paused` > `no_leader`, so a latched pause always READS `paused`; in
 * `no_leader` the follower is therefore NOT paused and Resume would only ack
 * "not paused" — disabled with that reason. */
export function resumeReason(
  state: GelloState | null,
  s: PanelSession,
  viewpointPaused = false,
): string | null {
  if (s.readOnly) return REASON_OBSERVER;
  if (s.controlDown) return REASON_LINK_DOWN;
  if (state === null) return REASON_NO_SESSION_HALF;
  if (state === "motion") return REASON_RESUME_AFTER_MOTION;
  if (viewpointPaused) return null;
  if (state === "tracking") return REASON_ALREADY_TRACKING;
  if (state === "out_of_sync") return REASON_OUT_OF_SYNC_AUTO;
  if (state === "no_leader") return REASON_NOT_PAUSED;
  return null;
}

/** Red banner text while the leader is lost during the session (the session half
 * present, `state` non-null). Keyed on the DEVICE status — `status !== "connected"`
 * (stale / error / starting / no_backend) — OR the `no_leader` state (a connected
 * device whose samples the engage rule rejects, e.g. a jump), so the banner survives
 * a pause or a motion window: `paused` outranks `no_leader` in the engage machine,
 * and a lost leader under a latched pause would otherwise vanish from the page. */
export function bannerText(g: GelloTelemetry): string | null {
  if (!g.state) return null;
  if (g.status === "connected" && g.state !== "no_leader") return null;
  const why = (g.state === "no_leader" && g.state_detail) || g.detail || `leader ${g.status}`;
  const consequence =
    g.state === "motion"
      ? "a planned motion owns the Manipulation Arm; it will not follow when the motion ends"
      : "the Manipulation Arm holds its last command";
  return `GELLO LEADER LOST — ${consequence} (${why})`;
}

/** Pure reducer: telemetry → everything the panel and the banner render. */
export function gelloPanelModel(g: GelloTelemetry, s: PanelSession = {}): GelloPanelModel {
  const state = g.state ?? null;
  const chip = state ? STATE_CHIP[state] : { tone: "grey" as GelloTone, label: "—" };
  const lag =
    state === "out_of_sync" && g.lag_rad
      ? g.lag_rad.map((rad, i) => ({
          joint: `J${i + 1}`,
          rad,
          frac: Math.min(1, Math.abs(rad) / LAG_BAR_FULL_RAD),
        }))
      : [];
  const viewpointPaused = g.viewpoint?.paused === true;
  const latched = g.paused_latched === true;
  const pause = pauseReason(state, s, latched);
  const resume = resumeReason(state, s, viewpointPaused);
  return {
    state,
    chip,
    detail: g.state_detail ?? "",
    lag,
    leader: {
      status: g.status,
      backend: g.backend,
      ageMs: g.age_s == null ? null : Math.round(g.age_s * 1000),
      rateHz: g.rate_hz ?? 0,
      gripperPct: g.gripper_frac == null ? null : Math.round(g.gripper_frac * 100),
      maxLagRad: g.max_lag_rad ?? null,
      detail: g.detail ?? "",
    },
    viewpoint: viewpointText(g.viewpoint),
    viewpointPaused,
    latched,
    pause: { disabled: pause !== null, reason: pause },
    resume: { disabled: resume !== null, reason: resume },
    banner: bannerText(g),
  };
}

const kbdFor = (bindings: Bindings | null, action: ActionName): string | null => {
  const code = bindings ? codeForAction(bindings, action) : null;
  return code ? keycapLabel(code) : null;
};
/** Keycap of a HELD row (`rail_neg` / `rail_pos` are not discrete actions). */
const heldKbdFor = (bindings: Bindings | null, action: string): string | null => {
  const code = bindings?.entries.find((e) => e.action === action)?.code ?? null;
  return code ? keycapLabel(code) : null;
};

const signed = (v: number): string => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`;

export interface GelloPanelProps {
  gello: GelloTelemetry;
  /** `telemetry.external` — the Dora bridge / viewpoint node (chip). */
  external?: ExternalStatus | null;
  bindings: Bindings | null;
  onAction(n: ActionName): void;
  /** Control link down (every action disabled). */
  disabled?: boolean;
  /** Observer role (every action disabled, with that reason). */
  readOnly?: boolean;
}

export function GelloPanel({
  gello,
  external = null,
  bindings,
  onAction,
  disabled = false,
  readOnly = false,
}: GelloPanelProps) {
  const model = gelloPanelModel(gello, { controlDown: disabled, readOnly });
  const railLeft = heldKbdFor(bindings, "rail_neg");
  const railRight = heldKbdFor(bindings, "rail_pos");
  const reset = kbdFor(bindings, "reset_to_initial");
  return (
    <div className="panel gello-panel" data-testid="gello-panel" data-state={model.state ?? ""}>
      <div className="gello-head">
        <span className="text-label fg-3">GELLO</span>
        <span
          className={`chip chip-${model.chip.tone}`}
          data-testid="gello-state-chip"
          data-state={model.state ?? ""}
        >
          {model.chip.label}
        </span>
      </div>
      {model.detail && (
        <div className="text-caption fg-3" data-testid="gello-state-detail">
          {model.detail}
        </div>
      )}
      {model.latched && (
        <div className="text-caption fg-2" data-testid="gello-latched">
          {LATCHED_CAPTION}
        </div>
      )}
      {model.lag.length > 0 && (
        <div className="gello-lag" data-testid="gello-lag" aria-label="leader minus arm, per joint">
          {model.lag.map((r) => (
            <div key={r.joint} className="gello-lag-row" data-testid={`gello-lag-${r.joint}`}>
              <span className="fg-3">{r.joint}</span>
              <span
                className="gello-lag-track"
                role="meter"
                aria-label={`${r.joint} lag`}
                aria-valuemin={0}
                aria-valuemax={LAG_BAR_FULL_RAD}
                aria-valuenow={Math.min(LAG_BAR_FULL_RAD, Math.abs(r.rad))}
              >
                <span
                  className="gello-lag-fill"
                  style={{ width: `${Math.round(r.frac * 100)}%` }}
                  data-testid={`gello-lag-fill-${r.joint}`}
                />
              </span>
              <span className="gello-lag-value">{signed(r.rad)} rad</span>
            </div>
          ))}
        </div>
      )}
      <div className="gello-actions">
        <div className="od-buttons">
          <button
            type="button"
            className="btn-secondary"
            disabled={model.pause.disabled}
            aria-describedby={model.pause.reason ? "gello-pause-reason" : undefined}
            onClick={() => onAction("gello_pause")}
            data-testid="gello-pause"
          >
            Pause
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={model.resume.disabled}
            aria-describedby={model.resume.reason ? "gello-resume-reason" : undefined}
            onClick={() => onAction("gello_resume")}
            data-testid="gello-resume"
          >
            Resume
          </button>
        </div>
        {model.pause.reason && (
          <span className="btn-reason" id="gello-pause-reason" data-testid="gello-pause-reason">
            Pause: {model.pause.reason}
          </span>
        )}
        {model.resume.reason && (
          <span className="btn-reason" id="gello-resume-reason" data-testid="gello-resume-reason">
            Resume: {model.resume.reason}
          </span>
        )}
      </div>
      <dl className="gello-rows" data-testid="gello-rows">
        <dt>leader</dt>
        <dd data-testid="gello-leader-status">
          {model.leader.status} · {model.leader.backend}
          {model.leader.detail && <span className="fg-3"> — {model.leader.detail}</span>}
        </dd>
        <dt>sample age</dt>
        <dd data-testid="gello-leader-age">
          {model.leader.ageMs == null ? "—" : `${model.leader.ageMs} ms`}
        </dd>
        <dt>rate</dt>
        <dd data-testid="gello-leader-rate">{model.leader.rateHz.toFixed(0)} Hz</dd>
        <dt>gripper</dt>
        <dd data-testid="gello-gripper">
          {model.leader.gripperPct == null ? "—" : `${model.leader.gripperPct}%`}
        </dd>
        <dt>max lag</dt>
        <dd data-testid="gello-max-lag">
          {model.leader.maxLagRad == null ? "—" : `${model.leader.maxLagRad.toFixed(3)} rad`}
        </dd>
        <dt>viewpoint</dt>
        <dd
          data-testid="gello-viewpoint"
          className={model.viewpointPaused ? "gello-viewpoint-paused" : undefined}
          data-paused={model.viewpointPaused ? "true" : undefined}
        >
          {model.viewpoint}
          {gello.viewpoint?.detail && (
            <span className={model.viewpointPaused ? undefined : "fg-3"}>
              {" "}
              — {gello.viewpoint.detail}
            </span>
          )}
        </dd>
      </dl>
      <div className="od-chips">
        <ExternalPolicyChip external={external} policyStale={false} />
      </div>
      <div className="dim od-hints" data-testid="gello-hints">
        {railLeft && railRight && (
          <span>
            <kbd>{railLeft}</kbd>
            <kbd>{railRight}</kbd> Manipulation Arm rail
          </span>
        )}
        {reset && (
          <span>
            <kbd>{reset}</kbd> return to the initial condition (ends paused)
          </span>
        )}
      </div>
    </div>
  );
}

export interface GelloBannerProps {
  gello: GelloTelemetry;
}

/** Red banner in `.cockpit-main` while the leader is lost during the session
 * (`bannerText`: device status not `connected`, or state `no_leader`). */
export function GelloBanner({ gello }: GelloBannerProps) {
  const text = bannerText(gello);
  if (!text) return null;
  return (
    <div className="banner banner-red" role="alert" data-testid="gello-banner">
      {text}
    </div>
  );
}
