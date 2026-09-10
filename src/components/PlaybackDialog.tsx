/** Episode playback dialog (2026-09-10; operator request, 05-ui §8.1 item 7).
 *
 * Opened by the **Playback** button on an episode row of the Welcome page's
 * `DatasetsPanel`. An in-page modal on the shared `Sheet` primitive, so the page behind
 * it is genuinely non-interactive (native `<dialog>.showModal()` makes it inert — not a
 * CSS overlay you can still tab into) and the × in the header, Escape and a backdrop
 * click all close it.
 *
 * Two actions, in the operator's order:
 *
 *   1. **Return to this episode's initial state** — `POST /api/session/playback
 *      {action: "goto_initial"}`, which is SYNCHRONOUS: it resolves when the arms are at
 *      the episode's first recorded frame, or with `ok: false` and a reason.
 *   2. **Play back the whole episode** — disabled until (1) has succeeded in this
 *      dialog. That is the operator's rule and the right one: replaying a trajectory
 *      from the wrong place is exactly how an arm gets driven into something. Re-opening
 *      the dialog starts over, because we cannot know the arms did not move meanwhile.
 *
 * Both are real motion on the real cell, so the dialog states the twin's blind spot
 * (03-sim §4.5: the room is not modelled) rather than leaving it to be remembered.
 *
 * **The dialog OWNS a session when it needs one** (operator request 2026-09-10, the same
 * day: "Start a session first" was a dead end here, because starting one from the
 * launcher navigates to the Cockpit and away from the Datasets panel). So the first
 * action brings a session up itself (`POST /api/session`, `start_from: keep_current` —
 * bring-up produces no motion) and closing the dialog tears it down (`DELETE`, which is
 * also motionless: the arms stop and brake where they stand). Two rules make that safe
 * to do from a page that is not the Cockpit:
 *
 *   - a session that was ALREADY running is used as-is and is never torn down here — it
 *     belongs to whoever started it, and the runtime hands the writer role to the first
 *     `/ws/control` connection anyway, which this page never opens;
 *   - a replay in flight is stopped before the teardown, so the arms are never cut off
 *     mid-motion by a click on ×.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  createSession as createSessionRest,
  endSession as endSessionRest,
  getEpisodePlayback,
  postSessionPlayback,
} from "../api/rest";
import type { EpisodeInfo, EpisodePlaybackInfo, SessionSpec } from "../gen";
import { armLabel } from "../lib/streams";
import { Sheet } from "./Sheet";

/** Sentence the dialog shows above the buttons whenever a motion is possible. The twin
 * does not model the room the cell sits in (03-sim §4.5), so every planned motion is
 * unverified until the cell is re-measured — the operator asked for that to be said out
 * loud wherever a motion can be started. */
export const UNVERIFIED_NOTICE =
  "Both actions move the real arms. The digital twin does not model the room yet, so " +
  "the safety gate cannot see the cart or the appliances — run at low speed with a hand " +
  "on the E-stop.";

/** Copy for the second button while it is still gated on the first. */
export const NEEDS_INITIAL = "Return to the initial state first";
/** What an older runtime (no trajectory replay) answers with; kept so a UI newer than
 * the runtime explains the 501 instead of showing it raw. */
export const PLAY_NOT_READY =
  "This runtime does not replay trajectories yet — it can only place the arms at the " +
  "episode's initial state. Update the runtime.";

/** Shown on the buttons while this dialog is bringing its own session up. A hardware
 * bring-up connects both control boxes and takes seconds, so it needs to be visible. */
export const STARTING_SESSION = "Starting a session…";
/** Caption while the dialog owns the session it created. */
export const OWNS_SESSION =
  "This dialog started a session for the playback and ends it when you close — the arms " +
  "stop and brake where they stand, with no return motion.";

export interface PlaybackDialogProps {
  repoId: string;
  episode: EpisodeInfo;
  open: boolean;
  onRequestClose(): void;
  /** True when a session is ALREADY running (`telemetry.session.session_id != null`):
   * the dialog then uses it and never tears it down. */
  sessionActive: boolean;
  /** The spec to bring a session up with when none is running — the tab's workcell,
   * every arm, `start_from: keep_current`. Null = this tab cannot host one. */
  spec: SessionSpec | null;
  /** Why a session cannot be started right now (the launcher's own reason, e.g. an
   * unhomed rail); shown instead of letting the operator meet a 409. */
  specReason?: string | null;
  /** Called after the dialog tore its own session down, so the owner can re-read. */
  onSessionEnded?(): void;
  /** Injected in tests; default to the real clients. */
  fetchInfo?: typeof getEpisodePlayback;
  runAction?: typeof postSessionPlayback;
  startSession?: typeof createSessionRest;
  stopSession?: typeof endSessionRest;
}

type Phase = "idle" | "starting" | "returning" | "at-initial" | "playing";

export function PlaybackDialog({
  repoId,
  episode,
  open,
  onRequestClose,
  sessionActive,
  spec,
  specReason = null,
  onSessionEnded,
  fetchInfo = getEpisodePlayback,
  runAction = postSessionPlayback,
  startSession = createSessionRest,
  stopSession = endSessionRest,
}: PlaybackDialogProps) {
  const [info, setInfo] = useState<EpisodePlaybackInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<{ ok: boolean; detail: string } | null>(null);
  // Did THIS dialog create the live session? Only then may it tear it down. A ref, not
  // state: the unmount cleanup has to read the current value, not a closed-over one.
  const owned = useRef(false);
  const [ownsSession, setOwnsSession] = useState(false);
  // A dialog that was closed mid-motion must not write state into an unmounted tree,
  // and the runtime keeps walking the arms either way — the Cockpit banner reports it.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setLoadError(null);
    fetchInfo(repoId, episode.episode_id)
      .then((got) => {
        if (!cancelled) setInfo(got);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof ApiError ? e.detail : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [fetchInfo, repoId, episode.episode_id]);

  const busy = phase === "starting" || phase === "returning" || phase === "playing";

  /** Bring a session up if none is running; returns "" on success, else the reason. */
  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionActive || owned.current) return "";
    if (spec === null) {
      return specReason ?? "This workcell cannot host a session right now.";
    }
    if (specReason !== null) return specReason;
    try {
      await startSession(spec);
      owned.current = true;
      setOwnsSession(true);
      return "";
    } catch (e: unknown) {
      return e instanceof ApiError ? e.detail : String(e);
    }
  }, [sessionActive, spec, specReason, startSession]);

  /** Close: stop a replay in flight, then end the session IF we started it. The runtime
   * would also release it by itself after `control.orphan_session_grace_s` (04-runtime
   * §13.2), but only for a session a controller once drove — this one never had one, so
   * the teardown has to be explicit or the arms would stay enabled indefinitely. */
  const closeAndRelease = useCallback(() => {
    onRequestClose();
    if (!owned.current) return;
    owned.current = false;
    const stopFirst =
      phase === "playing"
        ? runAction({ repo_id: repoId, episode_id: episode.episode_id, action: "stop" }).catch(
            () => undefined,
          )
        : Promise.resolve();
    void stopFirst
      .then(() => stopSession())
      .catch(() => undefined)
      .finally(() => {
        setOwnsSession(false);
        onSessionEnded?.();
      });
  }, [onRequestClose, phase, runAction, repoId, episode.episode_id, stopSession, onSessionEnded]);

  const act = useCallback(
    (action: "goto_initial" | "play" | "stop") => {
      if (action === "stop") {
        // Fire-and-forget: the in-flight `play` request resolves on its own with the
        // cancellation reason, which is the outcome worth showing.
        void runAction({ repo_id: repoId, episode_id: episode.episode_id, action });
        return;
      }
      setPhase("starting");
      setOutcome(null);
      void ensureSession()
        .then((refusal) => {
          if (!live.current) return null;
          if (refusal) {
            setOutcome({ ok: false, detail: refusal });
            setPhase("idle");
            return null;
          }
          setPhase(action === "goto_initial" ? "returning" : "playing");
          return runAction({ repo_id: repoId, episode_id: episode.episode_id, action });
        })
        .then((res) => {
          if (!live.current || res == null) return;
          setOutcome({ ok: res.ok, detail: res.detail ?? "" });
          // Only an arrival unlocks Playback. A skipped motion counts: "already at the
          // initial state" IS being there.
          setPhase(action === "goto_initial" && res.ok ? "at-initial" : "idle");
        })
        .catch((e: unknown) => {
          if (!live.current) return;
          const detail = e instanceof ApiError ? e.detail : String(e);
          // A 501 is this build's missing trajectory replay, not a cell problem — say so
          // in words the operator can act on, and keep the unlocked state.
          const notImplemented = e instanceof ApiError && e.status === 501;
          setOutcome({ ok: false, detail: notImplemented ? PLAY_NOT_READY : detail });
          setPhase(action === "play" ? "at-initial" : "idle");
        });
    },
    [ensureSession, runAction, repoId, episode.episode_id],
  );

  // `info.playable` is judged by the runtime against the session that exists WHEN the
  // dialog opens, so its "start a session first" is not a blocker here any more — this
  // dialog starts one. Only a reason about the EPISODE (a legacy tree, an arm set this
  // cell does not drive) blocks, plus a failed read and a launcher-level refusal.
  const episodeReason =
    info && !info.playable && !(info.reason ?? "").startsWith("Start a session")
      ? (info.reason ?? "")
      : null;
  const blockedReason = loadError ?? episodeReason ?? (spec === null ? specReason : null);
  const playReason = blockedReason ?? (phase === "at-initial" ? null : NEEDS_INITIAL);

  return (
    <Sheet
      open={open}
      title="Play back episode"
      subtitle={
        <span className="text-mono" data-testid="playback-episode">
          {repoId} · {episode.episode_id}
        </span>
      }
      width={480}
      testId="playback-dialog"
      hostTestId="playback-dialog-host"
      closeButtonTestId="playback-close"
      // A motion in flight must not be dismissed by a stray Escape or backdrop click:
      // the × stays available and the runtime keeps the arms under the gate either way.
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      onRequestClose={closeAndRelease}
      footer={
        <button className="btn-secondary" onClick={closeAndRelease} data-testid="playback-done">
          Close
        </button>
      }
    >
      <div className="playback-body">
        {info && (
          <dl className="kv text-caption" data-testid="playback-meta">
            <div>
              <dt>Frames</dt>
              <dd className="text-mono">{info.frames}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd className="text-mono">{info.duration_s.toFixed(1)} s</dd>
            </div>
            <div>
              <dt>Recorded at</dt>
              <dd className="text-mono">{info.fps.toFixed(0)} fps</dd>
            </div>
            <div>
              <dt>Arms</dt>
              <dd>{info.arms.map((a) => armLabel(a.arm_id)).join(", ")}</dd>
            </div>
          </dl>
        )}
        {!info && !loadError && (
          <p className="text-caption fg-3" data-testid="playback-loading">
            Reading the episode…
          </p>
        )}
        {blockedReason !== null && (
          <p className="sheet-error" role="alert" data-testid="playback-blocked">
            {blockedReason}
          </p>
        )}
        {blockedReason === null && (
          <p className="text-caption fg-3" data-testid="playback-notice">
            {UNVERIFIED_NOTICE}
          </p>
        )}
        <div className="playback-actions">
          <button
            data-autofocus
            disabled={busy || blockedReason !== null}
            onClick={() => act("goto_initial")}
            data-testid="playback-goto-initial"
          >
            {phase === "starting"
              ? STARTING_SESSION
              : phase === "returning"
                ? "Returning…"
                : "Return to the initial state"}
          </button>
          {phase === "playing" ? (
            <button className="btn-danger" onClick={() => act("stop")} data-testid="playback-stop">
              Stop
            </button>
          ) : (
            <button
              className="btn-primary"
              disabled={busy || playReason !== null}
              onClick={() => act("play")}
              data-testid="playback-play"
            >
              Play back the whole episode
            </button>
          )}
        </div>
        {phase === "playing" && (
          <p className="text-caption fg-3" role="status" data-testid="playback-playing">
            Replaying the recorded trajectory — the arms follow it through the safety gate. Any
            operator input, or Stop, cancels it and the arms hold where they are.
          </p>
        )}
        {playReason !== null && blockedReason === null && (
          <p className="text-caption fg-3" data-testid="playback-play-reason">
            {playReason}
          </p>
        )}
        {ownsSession && (
          <p className="text-caption fg-3" data-testid="playback-owns-session">
            {OWNS_SESSION}
          </p>
        )}
        {outcome !== null && (
          <p
            className={outcome.ok ? "text-caption fg-3" : "sheet-error"}
            role="status"
            data-testid="playback-outcome"
          >
            {outcome.detail || (outcome.ok ? "Done." : "Refused.")}
          </p>
        )}
      </div>
    </Sheet>
  );
}
