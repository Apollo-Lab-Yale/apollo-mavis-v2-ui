/** DAgger side panel shell — renders from telemetry; wiring lands in phase-08. */
import type { DaggerStatus } from "../gen";
import type { ActionName } from "../lib/types";

export interface DaggerPanelProps {
  dagger: DaggerStatus;
  onAction(n: ActionName): void;
}

export function DaggerPanel({ dagger }: DaggerPanelProps) {
  const mode = dagger.control_mode;
  return (
    <div className="panel" data-testid="dagger-panel">
      {mode === "policy" && (
        <span className="chip chip-blue" data-testid="dagger-mode-chip">
          POLICY DRIVING
        </span>
      )}
      {mode === "human" && (
        <span className="chip chip-green" data-testid="dagger-mode-chip">
          HUMAN TAKEOVER — recording intervention
        </span>
      )}
      {mode === "takeover_transition" && (
        <span className="chip chip-amber" data-testid="dagger-mode-chip">
          TRANSITION — frames unlabeled
        </span>
      )}
      <div className="kv">
        <span className="dim">policy</span>
        <span className="mono">{dagger.policy_version ?? "—"}</span>
      </div>
      {dagger.staged_version && (
        <div className="kv">
          <span className="dim">staged</span>
          <span className="mono">{dagger.staged_version}</span>
        </div>
      )}
      <div className="kv">
        <span className="dim">episodes labeled</span>
        <span className="mono">{dagger.episodes_labeled ?? 0}</span>
      </div>
      <div className="kv">
        <span className="dim">takeover (ep / run)</span>
        <span className="mono">
          {((dagger.takeover_rate_ep ?? 0) * 100).toFixed(0)}% /{" "}
          {((dagger.takeover_rate_run ?? 0) * 100).toFixed(0)}%
        </span>
      </div>
      <div className="dim">
        <kbd>Space</kbd> = takeover toggle
      </div>
    </div>
  );
}
