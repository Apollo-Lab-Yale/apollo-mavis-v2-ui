/** Direct joint-control panel — teleop page only (05-ui §8.3).
 *
 * 7 joint rows (+ rail row iff the active arm has one; hidden entirely when
 * absent). Slider drags emit `joint_target mode:"jog"` at ~20 Hz (50 ms
 * leading+trailing throttle) with the full positions vector; "Go to" emits
 * one `mode:"goto"`. Idle values seed from telemetry; a row being dragged or
 * edited is user-owned until release. Rows amber within 2% of their limits.
 * Whole panel locks while an episode is recording.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArmTelemetry } from "../gen";

export const JOG_THROTTLE_MS = 50; // ~20 Hz

export interface JointPanelProps {
  arm: ArmTelemetry;
  limits: [number, number][]; // 7 pairs (+ [0, 0.65] appended for rail arms)
  disabled: boolean; // true while episode recording
  onJog(positions: number[]): void;
  onGoto(positions: number[]): void;
}

export function JointPanel({ arm, limits, disabled, onJog, onGoto }: JointPanelProps) {
  const hasRail = arm.rail_pos_m !== null && arm.rail_pos_m !== undefined;
  const nRows = hasRail ? 8 : 7;

  const telemetryValues = useCallback((): number[] => {
    const v = arm.q.slice(0, 7).map((x) => x);
    while (v.length < 7) v.push(0);
    if (hasRail) v.push(arm.rail_pos_m ?? 0);
    return v;
  }, [arm.q, arm.rail_pos_m, hasRail]);

  const [values, setValues] = useState<number[]>(telemetryValues);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const owned = useRef<Set<number>>(new Set());
  const [, bumpOwned] = useState(0);

  // Seed idle rows from telemetry; user-owned rows keep their value.
  useEffect(() => {
    const t = telemetryValues();
    setValues((prev) =>
      t.map((tv, i) => (owned.current.has(i) ? (prev[i] ?? tv) : tv)).slice(0, nRows),
    );
  }, [telemetryValues, nRows]);

  // ~20 Hz leading+trailing throttle for jog sends.
  const lastJogAt = useRef(-Infinity);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendJog = useCallback(() => {
    const now = Date.now();
    const since = now - lastJogAt.current;
    if (since >= JOG_THROTTLE_MS) {
      lastJogAt.current = now;
      onJog([...valuesRef.current]);
    } else if (trailing.current === null) {
      trailing.current = setTimeout(() => {
        trailing.current = null;
        lastJogAt.current = Date.now();
        onJog([...valuesRef.current]);
      }, JOG_THROTTLE_MS - since);
    }
  }, [onJog]);
  useEffect(
    () => () => {
      if (trailing.current !== null) clearTimeout(trailing.current);
    },
    [],
  );

  const setRow = (i: number, v: number) => {
    setValues((prev) => prev.map((x, j) => (j === i ? v : x)));
    valuesRef.current = valuesRef.current.map((x, j) => (j === i ? v : x));
  };

  const own = (i: number) => {
    if (!owned.current.has(i)) {
      owned.current.add(i);
      bumpOwned((n) => n + 1);
    }
  };
  const release = (i: number) => {
    if (owned.current.delete(i)) bumpOwned((n) => n + 1);
  };

  const limitFor = (i: number): [number, number] =>
    limits[i] ?? (hasRail && i === 7 ? [0, 0.65] : [-Math.PI, Math.PI]);

  const nearLimit = (i: number): boolean => {
    const [lo, hi] = limitFor(i);
    const span = hi - lo;
    if (span <= 0) return false;
    const margin = span * 0.02;
    const commanded = values[i];
    const measured = i === 7 ? (arm.rail_pos_m ?? null) : (arm.q[i] ?? null);
    const near = (v: number | null | undefined) =>
      v != null && (v <= lo + margin || v >= hi - margin);
    return near(commanded) || near(measured);
  };

  const gotoState = arm.goto ?? null;
  const gotoBusy = gotoState === "planning" || gotoState === "executing";

  return (
    <div
      className="panel"
      data-testid="joint-panel"
      title={disabled ? "recording — panel locked" : undefined}
    >
      <div className="dim">Joint control — {arm.arm_id}</div>
      {Array.from({ length: nRows }, (_, i) => {
        const [lo, hi] = limitFor(i);
        const isRail = i === 7;
        const v = values[i] ?? 0;
        return (
          <div
            key={i}
            className={`joint-row${nearLimit(i) ? " row-amber" : ""}${gotoState === "failed" ? " row-red-flash" : ""}`}
            data-testid={isRail ? "joint-row-rail" : `joint-row-${i}`}
          >
            <span className="mono dim">{isRail ? "Rail" : `J${i + 1}`}</span>
            <input
              type="range"
              min={lo}
              max={hi}
              step={isRail ? 0.001 : 0.01}
              value={v}
              disabled={disabled}
              aria-label={isRail ? "rail position" : `joint ${i + 1}`}
              onPointerDown={() => own(i)}
              onChange={(e) => {
                own(i);
                setRow(i, Number(e.target.value));
                sendJog();
              }}
              onPointerUp={() => release(i)}
            />
            <input
              type="number"
              className="mono"
              step={isRail ? 0.001 : 0.01}
              value={Number(v.toFixed(3))}
              disabled={disabled}
              aria-label={isRail ? "rail position value" : `joint ${i + 1} value`}
              onFocus={() => own(i)}
              onChange={(e) => setRow(i, Number(e.target.value))}
              onBlur={() => release(i)}
            />
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
        <button
          disabled={disabled || gotoBusy}
          onClick={() => onGoto([...valuesRef.current])}
          data-testid="goto-button"
        >
          {gotoState === "planning"
            ? "Planning…"
            : gotoState === "executing"
              ? "Executing…"
              : "Go to"}
        </button>
        {gotoState === "failed" && (
          <span className="chip chip-red" data-testid="goto-failed">
            Go to failed
          </span>
        )}
      </div>
    </div>
  );
}
