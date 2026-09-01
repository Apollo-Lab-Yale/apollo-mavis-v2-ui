/** Episode controls (collect/dagger) — mirrors N/Enter/Backspace (05-ui §8.2).
 * No optimistic UI: state flips when telemetry confirms. Sessions 409 until
 * phase-07 activates recording; acks surface via toast.
 */
import type { EpisodeStatus } from "../gen";
import type { ActionName } from "../lib/types";

export interface EpisodeControlsProps {
  episode: EpisodeStatus;
  onAction(n: ActionName): void;
  disabled?: boolean; // control link down
}

export function EpisodeControls({ episode, onAction, disabled = false }: EpisodeControlsProps) {
  const { state } = episode;
  return (
    <div className="panel" data-testid="episode-controls">
      <div className="dim">
        Episode{" "}
        {state === "recording" && (
          <span data-testid="rec-indicator">
            <span className="rec-dot" /> REC #{episode.index ?? "—"} · {episode.frames} frames ·{" "}
            {episode.duration_s.toFixed(1)} s
          </span>
        )}
        {state === "saving" && <span className="chip chip-amber">saving…</span>}
        {state === "idle" && <span className="chip chip-grey">idle</span>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          disabled={disabled || state !== "idle"}
          onClick={() => onAction("episode_new")}
          data-testid="episode-new"
        >
          New episode (N)
        </button>
        <button
          disabled={disabled || state !== "recording"}
          onClick={() => onAction("episode_save")}
          data-testid="episode-save"
        >
          Save (Enter)
        </button>
        <button
          disabled={disabled || state !== "recording"}
          onClick={() => onAction("episode_discard")}
          data-testid="episode-discard"
        >
          Discard (Backspace)
        </button>
      </div>
    </div>
  );
}
