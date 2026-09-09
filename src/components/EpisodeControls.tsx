/** Episode controls (collect/dagger) — the three buttons mirror the episode keys
 * (05-ui §8.2). Their key hints come from the SERVED keymap (`codeForAction` +
 * `keycapLabel`, the ArmIndicator `shortcut` pattern; 2026-09-07) — never
 * hard-coded, so a rebound key moves the hint with it; `bindings: null` shows no
 * hint. No optimistic UI: state flips when telemetry confirms. `returning`
 * (return-to-start sessions, 04-runtime §10.5) disables everything and shows the
 * runtime's `detail`; the header names the dataset and the episodes saved into it.
 * Online DAgger (15-online-dagger §8) adds ONLY `newEpisodeReason`: while the
 * trainer is not alive or the coordinator is not in `rollout` (15-online-dagger §3:
 * waiting_trainer / training / error) the runtime is GUARANTEED to refuse
 * `episode_new`, so New episode is disabled with that reason visible instead of
 * letting the operator meet the nack toast. The session's actor split renders in
 * `OnlineDaggerPanel`, not here (§8 puts it in the panel).
 */
import type { EpisodeStatus } from "../gen";
import { codeForAction, keycapLabel, type Bindings } from "../input/bindings";
import type { ActionName } from "../lib/types";

export interface EpisodeControlsProps {
  episode: EpisodeStatus;
  bindings: Bindings | null;
  onAction(n: ActionName): void;
  disabled?: boolean; // control link down
  /** Why `episode_new` cannot succeed right now (Online DAgger phase gate,
   * `newRolloutReason`); non-null disables New episode and shows the text under
   * the row. Null / omitted → the episode state alone decides. */
  newEpisodeReason?: string | null;
}

function hint(bindings: Bindings | null, action: ActionName): string {
  const code = bindings ? codeForAction(bindings, action) : null;
  return code ? ` (${keycapLabel(code)})` : "";
}

export function EpisodeControls({
  episode,
  bindings,
  onAction,
  disabled = false,
  newEpisodeReason = null,
}: EpisodeControlsProps) {
  const { state } = episode;
  const total = episode.total_episodes ?? 0;
  // The reason only matters while New would otherwise be clickable.
  const newBlocked = state === "idle" && !disabled && newEpisodeReason !== null;
  return (
    <div className="panel" data-testid="episode-controls">
      {episode.repo_id != null && (
        <div className="episode-dataset text-caption fg-3" data-testid="episode-repo">
          <span className="text-mono">{episode.repo_id}</span>
          <span data-testid="episode-total">
            {" · "}
            {total} {total === 1 ? "episode" : "episodes"} saved
          </span>
        </div>
      )}
      <div className="dim">
        Episode{" "}
        {state === "recording" && (
          <span data-testid="rec-indicator">
            <span className="rec-dot" /> REC #{episode.index ?? "—"} · {episode.frames} frames ·{" "}
            {episode.duration_s.toFixed(1)} s
            {(episode.frames_skipped ?? 0) > 0 && (
              <span data-testid="rec-skipped"> · skipped {episode.frames_skipped}</span>
            )}
          </span>
        )}
        {state === "saving" && <span className="chip chip-amber">saving…</span>}
        {state === "returning" && (
          <span className="chip chip-amber" data-testid="episode-returning">
            returning to start
          </span>
        )}
        {state === "idle" && <span className="chip chip-grey">idle</span>}
      </div>
      {!!episode.detail && (
        <div className="text-caption fg-3 episode-detail" data-testid="episode-detail">
          {episode.detail}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          disabled={disabled || state !== "idle" || newEpisodeReason !== null}
          aria-describedby={newBlocked ? "episode-new-reason" : undefined}
          onClick={() => onAction("episode_new")}
          data-testid="episode-new"
        >
          New episode{hint(bindings, "episode_new")}
        </button>
        <button
          disabled={disabled || state !== "recording"}
          onClick={() => onAction("episode_save")}
          data-testid="episode-save"
        >
          Save{hint(bindings, "episode_save")}
        </button>
        <button
          disabled={disabled || state !== "recording"}
          onClick={() => onAction("episode_discard")}
          data-testid="episode-discard"
        >
          Discard{hint(bindings, "episode_discard")}
        </button>
      </div>
      {newBlocked && (
        <div className="btn-reason" id="episode-new-reason" data-testid="episode-new-reason">
          {newEpisodeReason}
        </div>
      )}
    </div>
  );
}
