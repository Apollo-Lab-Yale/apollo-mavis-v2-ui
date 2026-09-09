/** Direct joint-control panel — teleop page only (05-ui §8.3).
 *
 * 7 joint rows (+ rail row iff the active arm has one; hidden entirely when
 * absent). ONE mode, `joint_target mode:"jog"`: every row is a DESTINATION and
 * the arm walks toward it at the loop's fixed `jog.slew_rad_per_tick` (the
 * driver's servo rate on hardware). So a slider drag is followed continuously
 * — throttled to ~20 Hz, latest-wins — and dragging faster than the arm can
 * move just leaves it trailing and catching up, never jumping; a click on the
 * slider track or a typed value is the same command with a larger delta, i.e. a
 * longer constant-speed move. The number box commits on Enter, on blur, and
 * 500 ms after you stop typing (so the spinner arrows work too); while it is
 * focused it holds your raw text, unrounded.
 *
 * There is no "Go to" button: it planned a route around obstacles, which is not
 * what this panel is for (2026-09-07, operator's call). The runtime keeps
 * `mode:"goto"` for the profile / rail-homing paths that do need routing. The
 * price here is that a straight joint-space line into an obstacle is HELD by
 * the safety gate rather than routed around.
 *
 * Idle values seed from telemetry; a row being dragged or edited is user-owned
 * until release. Rows amber within 2% of their limits. Whole panel locks while
 * an episode is recording.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArmTelemetry } from "../gen";
import { armLabel } from "../lib/streams";

export const JOG_THROTTLE_MS = 50; // ~20 Hz while dragging
export const TYPE_COMMIT_MS = 500; // number box: commit this long after the last keystroke

export interface JointPanelProps {
  arm: ArmTelemetry;
  limits: [number, number][]; // 7 pairs (+ [0, 0.65] appended for rail arms)
  disabled: boolean; // true while episode recording
  onJog(positions: number[]): void;
}

export function JointPanel({ arm, limits, disabled, onJog }: JointPanelProps) {
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
  // Raw text of a focused number box, so typing is never fought by rounding.
  const [drafts, setDrafts] = useState<Record<number, string>>({});

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

  // Debounced commit for the number boxes (see TYPE_COMMIT_MS).
  const typeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTypeCommit = () => {
    if (typeTimer.current !== null) {
      clearTimeout(typeTimer.current);
      typeTimer.current = null;
    }
  };
  const scheduleTypeCommit = useCallback(() => {
    cancelTypeCommit();
    typeTimer.current = setTimeout(() => {
      typeTimer.current = null;
      sendJog();
    }, TYPE_COMMIT_MS);
  }, [sendJog]);

  useEffect(
    () => () => {
      if (trailing.current !== null) clearTimeout(trailing.current);
      cancelTypeCommit();
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

  /** Clamp a typed value into the row's limits — the runtime would clamp anyway,
   * and letting the slider show an out-of-range value is just confusing. */
  const clampRow = (i: number, v: number): number => {
    const [lo, hi] = limitFor(i);
    return Math.min(hi, Math.max(lo, v));
  };

  const commitTyped = (i: number) => {
    cancelTypeCommit();
    const raw = drafts[i];
    if (raw !== undefined) {
      const parsed = Number(raw);
      if (raw.trim() !== "" && Number.isFinite(parsed)) setRow(i, clampRow(i, parsed));
    }
    sendJog();
  };

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

  return (
    <div
      className="panel"
      data-testid="joint-panel"
      title={disabled ? "recording — panel locked" : undefined}
    >
      <div className="dim">
        Joint control — {armLabel(arm.arm_id)} <span className="chip chip-id">{arm.arm_id}</span>
      </div>
      {Array.from({ length: nRows }, (_, i) => {
        const [lo, hi] = limitFor(i);
        const isRail = i === 7;
        const v = values[i] ?? 0;
        return (
          <div
            key={i}
            className={`joint-row${nearLimit(i) ? " row-amber" : ""}`}
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
              value={drafts[i] ?? Number(v.toFixed(3))}
              disabled={disabled}
              aria-label={isRail ? "rail position value" : `joint ${i + 1} value`}
              onFocus={() => own(i)}
              onChange={(e) => {
                own(i);
                const raw = e.target.value;
                setDrafts((d) => ({ ...d, [i]: raw }));
                const parsed = Number(raw);
                if (raw.trim() !== "" && Number.isFinite(parsed)) {
                  setRow(i, clampRow(i, parsed));
                  scheduleTypeCommit();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTyped(i);
              }}
              onBlur={() => {
                commitTyped(i);
                setDrafts(({ [i]: _drop, ...rest }) => rest);
                release(i);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
