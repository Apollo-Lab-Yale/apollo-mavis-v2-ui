/** Click-to-arm capture surface wrapping the StreamGrid (05-ui §8.2, §9). */
import { useEffect } from "react";
import { setHeldSource } from "../api/clients";
import type { ControlClient } from "../api/ws/control";
import type { Bindings } from "../input/bindings";
import { useKeyCapture } from "../input/useKeyCapture";
import type { Mode } from "../lib/types";
import { useStore } from "../store";

export interface TeleopSurfaceProps {
  enabled: boolean; // false only for observer role
  mode: Mode;
  bindings: Bindings | null;
  control: ControlClient;
  children: React.ReactNode;
}

export function TeleopSurface({ enabled, mode, bindings, control, children }: TeleopSurfaceProps) {
  const controlOpen = useStore((s) => s.conn.control === "open");
  const setCaptureArmed = useStore((s) => s.setCaptureArmed);

  const capture = useKeyCapture({
    bindings,
    onHeldChange: () => control.notifyTransition(),
    onAction: (name) => control.sendAction(name),
    onArmedChange: (armed) => {
      control.setArmed(armed);
      setCaptureArmed(armed);
    },
  });

  // The control client reads held keys straight from the capture ref.
  useEffect(() => {
    setHeldSource(() => capture.heldRef.current ?? new Set());
    return () => setHeldSource(() => new Set());
  }, [capture.heldRef]);

  // Release-all when the control link is not open.
  useEffect(() => {
    if (!controlOpen) capture.disarm();
  }, [controlOpen, capture]);

  const canArm = enabled && bindings !== null && controlOpen;

  return (
    <div
      className={`surface${capture.armed ? " surface-armed" : ""}`}
      tabIndex={0}
      role="button"
      aria-label="teleop capture surface"
      data-testid="teleop-surface"
      data-armed={capture.armed}
      onClick={() => {
        if (canArm) capture.arm();
      }}
      onBlur={() => capture.disarm()}
    >
      {capture.armed && (
        <span className="surface-chip chip chip-green" data-testid="capturing-chip">
          CAPTURING — Esc to release
        </span>
      )}
      {mode === "inference" && (
        <span className="chip chip-blue" data-testid="inference-escape-chip">
          Policy driving — Space = takeover (safety escape)
        </span>
      )}
      {!enabled && <span className="chip chip-grey">read-only (observer)</span>}
      {children}
    </div>
  );
}
