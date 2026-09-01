/** One video pane (landing + cockpit). Owns a <canvas> + one VideoStream. */
import { useEffect, useRef } from "react";
import { VideoStream } from "../api/ws/video";
import type { WsFactory } from "../api/ws/reconnecting";
import { useStore } from "../store";

export interface StreamViewProps {
  streamId: string;
  label: string;
  useWorker?: boolean;
  showLatencyBadge?: boolean; // default true in cockpit, false on landing
  highlight?: "none" | "blocked"; // flashing border while twin gate blocks
  wsFactory?: WsFactory; // tests
}

const workerFlag = (): boolean => {
  if (typeof location !== "undefined" && location.search.includes("worker=1")) return true;
  return import.meta.env?.VITE_VIDEO_WORKER === "1";
};

export function StreamView({
  streamId,
  label,
  useWorker,
  showLatencyBadge = true,
  highlight = "none",
  wsFactory,
}: StreamViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stats = useStore((s) => s.video[streamId]);
  const setVideoStats = useStore((s) => s.setVideoStats);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stream = new VideoStream({
      streamId,
      canvas,
      useWorker: useWorker ?? workerFlag(),
      wsFactory,
      onStats: (st) =>
        setVideoStats(streamId, {
          stale: st.stale,
          fps: st.fps,
          latencyMs: st.latencyMs,
          status: st.status,
        }),
    });
    stream.start();
    return () => stream.stop();
  }, [streamId, useWorker, wsFactory, setVideoStats]);

  const closed = stats?.status === "closed";
  const connecting = stats?.status === "connecting";
  const stale = stats?.stale ?? false;

  return (
    <div
      className={`tile${highlight === "blocked" ? " tile-blocked" : ""}`}
      data-testid={`stream-${streamId}`}
    >
      <canvas ref={canvasRef} />
      <span className="tile-label">{label}</span>
      {closed && (
        <div className="tile-empty" data-testid="stream-closed">
          Stream unavailable — retrying…
        </div>
      )}
      {connecting && !closed && <div className="tile-empty">connecting…</div>}
      {stale && !closed && (
        <div className="tile-stale-overlay" data-testid="stream-stale">
          <span className="chip chip-grey">STALE</span>
        </div>
      )}
      {showLatencyBadge && stats && !closed && (
        <span className="tile-badge mono">
          {Math.round(stats.fps)} fps
          {stats.latencyMs != null ? ` · ${Math.round(stats.latencyMs)} ms` : ""}
        </span>
      )}
    </div>
  );
}
