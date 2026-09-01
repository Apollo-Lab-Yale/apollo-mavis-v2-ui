/** Collision banner + clearance readout (05-ui §8.2). */
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

export interface ClearanceReadoutProps {
  clearances: TelemetryMsg["clearances"];
  k?: number; // default 5
}

function gradeClass(distM: number): string {
  if (distM < 0.02) return "chip-red";
  if (distM < 0.05) return "chip-amber";
  return "chip-green";
}

export function ClearanceReadout({ clearances, k = 5 }: ClearanceReadoutProps) {
  const smallest = [...clearances].sort((a, b) => a.dist_m - b.dist_m).slice(0, k);
  return (
    <div className="panel" data-testid="clearance-readout">
      <div className="dim">Clearances (k={k} min)</div>
      {smallest.length === 0 && <div className="dim mono">—</div>}
      {smallest.map((c) => (
        <div className="kv mono" key={`${c.pair[0]}|${c.pair[1]}`}>
          <span>
            {c.pair[0]} ↔ {c.pair[1]}
          </span>
          <span className={`chip ${gradeClass(c.dist_m)}`}>{Math.round(c.dist_m * 1000)} mm</span>
        </div>
      ))}
    </div>
  );
}
