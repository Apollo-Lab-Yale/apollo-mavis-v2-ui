/** 2-col grid up to 4 tiles, 3-col for 5–6 (05-ui §9). */
import { StreamView } from "./StreamView";
import { useStore } from "../store";

export interface StreamGridProps {
  streamIds: string[];
  labels: Record<string, string>;
}

export function StreamGrid({ streamIds, labels }: StreamGridProps) {
  const blocked = useStore((s) => s.telemetry?.collision.blocked ?? false);
  return (
    <div className={`stream-grid${streamIds.length > 4 ? " stream-grid-3col" : ""}`}>
      {streamIds.map((id) => (
        <StreamView
          key={id}
          streamId={id}
          label={labels[id] ?? id}
          highlight={blocked && (id === "sim" || id === "twin") ? "blocked" : "none"}
        />
      ))}
    </div>
  );
}
