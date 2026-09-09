/** Collision banner + clearance readout (05-ui §8.2).
 *
 * Clearance readout (16-gello §12.4, operator request 2026-09-09): the runtime sends
 * at most five pairs and the row COUNT never grew — what grew was row HEIGHT: pair
 * labels such as `grip_right_finger_pad_2 ↔ view_d435_mount` wrapped to two or three
 * lines in the 320 px side column and, with no height bound, pushed the episode
 * buttons below out of view. So the readout shows the `CLEARANCE_ROWS` (4) closest
 * pairs, every row is ONE line (the pair label ellipsised with the full text in its
 * `title`, the chip never shrinks), and the panel has its own `max-height` + scroll
 * (`.clearance-readout` in global.css). The Cockpit renders `EpisodeControls` ABOVE
 * it in collect / dagger for the same reason. */
import type { CollisionReport, TelemetryMsg } from "../gen";

export interface CollisionBannerProps {
  report: CollisionReport;
  stale?: boolean;
}

export function CollisionBanner({ report, stale = false }: CollisionBannerProps) {
  if (report.severity === "ok") return null;
  const pairs = (report.pairs ?? []).map(([a, b]) => `${a} ↔ ${b}`).join(", ");
  const mm = Math.round((report.min_clearance_m ?? 0) * 1000);
  if (report.severity === "blocked") {
    return (
      <div className="banner banner-red" data-testid="collision-banner">
        COMMAND BLOCKED BY TWIN GATE {pairs && `— ${pairs}`}
        {stale && " (stale)"}
      </div>
    );
  }
  return (
    <div className="banner banner-amber" data-testid="collision-banner">
      CLEARANCE LOW {pairs} ({mm} mm){stale && " (stale)"}
    </div>
  );
}

/** Rows the readout shows by default: the 4 closest of the runtime's five. */
export const CLEARANCE_ROWS = 4;

export interface ClearanceReadoutProps {
  clearances: TelemetryMsg["clearances"];
  /** Rows shown (default `CLEARANCE_ROWS`). */
  k?: number;
}

function gradeClass(distM: number): string {
  if (distM < 0.02) return "chip-red";
  if (distM < 0.05) return "chip-amber";
  return "chip-green";
}

export function ClearanceReadout({ clearances, k = CLEARANCE_ROWS }: ClearanceReadoutProps) {
  const smallest = [...clearances].sort((a, b) => a.dist_m - b.dist_m).slice(0, k);
  return (
    <div className="panel clearance-readout" data-testid="clearance-readout" data-rows={k}>
      <div className="dim">Clearances ({k} closest)</div>
      {smallest.length === 0 && <div className="dim mono">—</div>}
      {smallest.map((c) => {
        const label = `${c.pair[0]} ↔ ${c.pair[1]}`;
        return (
          <div className="kv mono clearance-row" key={`${c.pair[0]}|${c.pair[1]}`}>
            <span className="clearance-pair" title={label}>
              {label}
            </span>
            <span className={`chip clearance-chip ${gradeClass(c.dist_m)}`}>
              {Math.round(c.dist_m * 1000)} mm
            </span>
          </div>
        );
      })}
    </div>
  );
}
