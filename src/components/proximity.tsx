/** Twin-proximity frame around the Cockpit's stream grid (05-ui §8.2, 2026-09-07).
 *
 * The digital twin measures the clearance between every monitored geometry
 * pair (arm ↔ arm, arm ↔ table / obstacle / rail) at 25 Hz and the runtime
 * publishes the pairs closer than `SafetyConfig.clearance_sweep_m` (0.10 m) as
 * `telemetry.clearances`. This module turns the smallest of them into ONE
 * continuous scalar, `level` ∈ [0, 1], and the `ProximityFrame` paints it as a
 * translucent ring + inward glow on the surface that holds the camera tiles:
 * nothing at ≥ 0.10 m, amber deepening to 0.05 m ("near an obstacle"), then
 * shifting to red that saturates at 0.02 m. The same 0.05 / 0.02 m breakpoints
 * grade the `ClearanceReadout` chips, so the frame and the side panel always
 * agree. A gate block paints the full red ring regardless of distance.
 *
 * Design rules (emilkowalski/skills — apple-design, emil-design-eng):
 *  - feedback is CONTINUOUS while the operator moves (the level tracks telemetry
 *    1:1; the 200 ms ease-out transition only smooths the 25 Hz steps),
 *  - a semi-transparent glow instead of a solid border; only `opacity` animates
 *    (two colour layers cross-fade), transitions not keyframes, so a level that
 *    changes every frame retargets smoothly instead of restarting,
 *  - no slow infinite loop on the blocked state (the tiles already flash),
 *  - reduced motion keeps the colour/opacity change (it aids comprehension) and
 *    drops the chip's entrance translate; reduced transparency frosts the chip.
 *
 * Honesty rules: `collision.min_clearance_m` is a SENTINEL 1.0 on the ok path,
 * so the distance comes from `clearances` first; a missing telemetry frame is
 * "clear", never an alarm; stale telemetry keeps the last level but greys the
 * ring (`data-stale`) rather than pretending it is live. A plain sim session
 * has no safety twin (`safety_debug: false`) and therefore never lists
 * clearances — the frame simply stays off there.
 */
import type { CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import type { TelemetryMsg } from "../gen";
import { useStore, type AppState } from "../store";

/** Frame starts to tint below this clearance (= the runtime's sweep range). */
export const PROXIMITY_FAR_M = 0.1;
/** Amber saturates here — "near an obstacle" (ClearanceReadout's amber grade). */
export const PROXIMITY_NEAR_M = 0.05;
/** Red saturates here (ClearanceReadout's red grade; the gate blocks at 0.008). */
export const PROXIMITY_CLOSE_M = 0.02;
/** Level quantisation: 100 steps (1 mm of the amber band) keep the store
 * selector shallow-stable at 25 Hz without visible banding. */
export const PROXIMITY_STEPS = 100;

export type ProximityTone = "clear" | "near" | "close" | "blocked";

export interface Proximity {
  tone: ProximityTone;
  /** 0 at ≥ FAR, 0.5 at NEAR (full amber), 1 at ≤ CLOSE or blocked (full red). */
  level: number;
  /** Smallest clearance, rounded to mm; null when no pair is within range. */
  distMm: number | null;
  /** "grip/link6 ↔ table" for the closest pair; null without one. */
  pairText: string | null;
  /** Telemetry older than the UI's staleness window: the ring greys. */
  stale: boolean;
}

export const PROXIMITY_CLEAR: Proximity = {
  tone: "clear",
  level: 0,
  distMm: null,
  pairText: null,
  stale: false,
};

const quantise = (x: number): number =>
  Math.round(Math.min(1, Math.max(0, x)) * PROXIMITY_STEPS) / PROXIMITY_STEPS;

/** Piecewise-linear clearance → level: FAR→0, NEAR→0.5, CLOSE→1 (clamped).
 * Computed on whole millimetres, the resolution the chip shows, so equal
 * distances always map to equal levels (no float-noise flicker). */
export function proximityLevel(distM: number): number {
  if (!Number.isFinite(distM)) return 0;
  const mm = Math.round(distM * 1000);
  const far = Math.round(PROXIMITY_FAR_M * 1000);
  const near = Math.round(PROXIMITY_NEAR_M * 1000);
  const close = Math.round(PROXIMITY_CLOSE_M * 1000);
  if (mm >= far) return 0;
  if (mm >= near) return quantise((0.5 * (far - mm)) / (far - near));
  if (mm >= close) return quantise(0.5 + (0.5 * (near - mm)) / (near - close));
  return 1;
}

const pairLabel = (pair: readonly [string, string] | undefined | null): string | null =>
  pair ? `${pair[0]} ↔ ${pair[1]}` : null;

/** Classify one telemetry frame (pure). */
export function proximity(telemetry: TelemetryMsg | null, stale = false): Proximity {
  if (!telemetry) return PROXIMITY_CLEAR;
  const report = telemetry.collision;
  let closest: { dist_m: number; pair: readonly [string, string] } | null = null;
  for (const c of telemetry.clearances ?? []) {
    if (!Number.isFinite(c.dist_m)) continue;
    if (closest === null || c.dist_m < closest.dist_m) closest = c;
  }
  if (report?.blocked) {
    // The gate's own min is real while blocked (the 1.0 sentinel is the ok path).
    const reportMin = report.min_clearance_m;
    const dist =
      closest?.dist_m ?? (reportMin != null && reportMin < PROXIMITY_FAR_M ? reportMin : null);
    return {
      tone: "blocked",
      level: 1,
      distMm: dist === null ? null : Math.round(dist * 1000),
      pairText: pairLabel(closest?.pair ?? report.pairs?.[0]),
      stale,
    };
  }
  if (closest === null || closest.dist_m >= PROXIMITY_FAR_M) {
    return stale ? { ...PROXIMITY_CLEAR, stale } : PROXIMITY_CLEAR;
  }
  return {
    tone: closest.dist_m < PROXIMITY_NEAR_M ? "close" : "near",
    level: proximityLevel(closest.dist_m),
    distMm: Math.round(closest.dist_m * 1000),
    pairText: pairLabel(closest.pair),
    stale,
  };
}

/** Store selector — every field is a primitive, so `useShallow` re-renders the
 * frame only when the quantised level, tone, distance or pair changes. */
export const selectProximity = (s: AppState): Proximity => proximity(s.telemetry, s.telemetryStale);

export function useProximity(): Proximity {
  return useStore(useShallow(selectProximity));
}

export const PROXIMITY_LABELS: Record<ProximityTone, string> = {
  clear: "",
  near: "Near obstacle",
  close: "Very close",
  blocked: "Blocked by twin gate",
};

/** Absolutely positioned overlay for the `.surface` (pointer-events: none):
 * the ring is drawn by CSS from `--prox` + `data-tone`; the chip names the
 * closest pair while the frame is active. */
export function ProximityFrame() {
  const p = useProximity();
  const active = p.tone !== "clear";
  return (
    <div
      className="proximity-frame"
      data-testid="proximity-frame"
      data-tone={p.tone}
      data-stale={p.stale ? "true" : undefined}
      style={{ "--prox": p.level } as CSSProperties}
      aria-hidden={!active}
    >
      {active && (
        <div className="proximity-chip" role="status" data-testid="proximity-chip">
          <span className="proximity-dot" aria-hidden="true" />
          <span className="proximity-label">{PROXIMITY_LABELS[p.tone]}</span>
          {p.distMm !== null && <span className="proximity-dist mono">{p.distMm} mm</span>}
          {p.pairText && <span className="proximity-pair mono">{p.pairText}</span>}
          {p.stale && <span className="proximity-stale">stale</span>}
        </div>
      )}
    </div>
  );
}
