/** Inference side panel — takeover = SAFETY ESCAPE, never recorded (05-ui §8.2). */
import { useState } from "react";
import type { InferenceStatus } from "../gen";
import { ConfirmDialog } from "./ConfirmDialog";

export interface InferencePanelProps {
  inference: InferenceStatus;
  onTerminate(): void; // DELETE /api/session; emphasized during takeover
}

export function InferencePanel({ inference, onTerminate }: InferencePanelProps) {
  const [confirming, setConfirming] = useState(false);
  const takeover = inference.control_mode === "human";
  return (
    <div className="panel" data-testid="inference-panel">
      {takeover ? (
        <span className="chip chip-hazard" data-testid="inference-mode-chip">
          SAFETY ESCAPE — NOT RECORDED
        </span>
      ) : inference.control_mode === "takeover_transition" ? (
        <span className="chip chip-amber" data-testid="inference-mode-chip">
          TRANSITION
        </span>
      ) : (
        <span className="chip chip-blue" data-testid="inference-mode-chip">
          POLICY DRIVING
        </span>
      )}
      <div className="kv">
        <span className="dim">policy</span>
        <span className="mono">{inference.policy_version ?? "—"}</span>
      </div>
      {takeover ? (
        // Escape playbook: "steer to safe, then terminate" must be one click.
        <button
          className="btn-danger btn-danger-big"
          onClick={onTerminate}
          data-testid="terminate-session"
        >
          Terminate session
        </button>
      ) : (
        <button
          className="btn-danger"
          onClick={() => setConfirming(true)}
          data-testid="terminate-session"
        >
          Terminate session
        </button>
      )}
      {confirming && (
        <ConfirmDialog
          text="End the inference session?"
          confirmLabel="Terminate"
          onConfirm={() => {
            setConfirming(false);
            onTerminate();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
