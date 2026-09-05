/** One video pane (landing + cockpit). Owns a <canvas> + one VideoStream.
 *
 * Re-skinned for phase-11 §4: 16/9 tile, `data-state` =
 * live | connecting | stale | closed | absent, title pill top-left (display
 * name via `title`; the stream id stays canonical), status pill top-right.
 * `absent` (camera configured but not live) renders pure black with a
 * crossed-camera glyph and opens NO WebSocket — `/ws/video/<unknown>` closes
 * 1008 and the client would otherwise re-dial forever. STALE keeps the last
 * frame under a grey scrim (05-ui §10). An optional `note` (phase-09a: the twin
 * overlay's `detail`) is one line of small text along the bottom edge; it is
 * static text, never animated. Nothing on the canvas is animated. */
import { useEffect, useRef } from "react";
import { VideoStream } from "../api/ws/video";
import type { WsFactory } from "../api/ws/reconnecting";
import { streamLabel } from "../lib/streams";
import { useStore, type VideoTileStats } from "../store";
import { Icon } from "./icons";

export type StreamState = "live" | "connecting" | "stale" | "closed" | "absent";

export interface StreamViewProps {
  streamId: string;
  /** Legacy display label; prefer `title`. */
  label?: string;
  /** Display name for the title pill (defaults to STREAM_LABELS / the id). */
  title?: string;
  /** Configured-but-not-live camera → black tile, no WebSocket. */
  absent?: boolean;
  useWorker?: boolean;
  showLatencyBadge?: boolean; // default true in cockpit, false on landing
  highlight?: "none" | "blocked"; // flashing border while twin gate blocks
  /** One line of small text along the bottom edge (`tile-badge tile-note`),
   * e.g. "rail not homed · twin assumes 0.65 m"; nothing renders when empty.
   * Meant for tiles without the latency badge (both sit bottom-left). */
  note?: string;
  wsFactory?: WsFactory; // tests
}

const workerFlag = (): boolean => {
  if (typeof location !== "undefined" && location.search.includes("worker=1")) return true;
  return import.meta.env?.VITE_VIDEO_WORKER === "1";
};

/** Pure state derivation (exported for tests). */
export function streamState(stats: VideoTileStats | undefined, absent: boolean): StreamState {
  if (absent) return "absent";
  if (!stats) return "connecting";
  if (stats.status === "closed") return "closed";
  if (stats.status === "connecting" || stats.hasFrame === false) return "connecting";
  return stats.stale ? "stale" : "live";
}

const STATUS_TEXT: Record<Exclude<StreamState, "absent">, string> = {
  live: "LIVE",
  connecting: "Connecting…",
  stale: "STALE",
  closed: "RETRYING",
};

export function StreamView({
  streamId,
  label,
  title,
  absent = false,
  useWorker,
  showLatencyBadge = true,
  highlight = "none",
  note,
  wsFactory,
}: StreamViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stats = useStore((s) => s.video[streamId]);
  const setVideoStats = useStore((s) => s.setVideoStats);

  useEffect(() => {
    if (absent) return; // never dial an absent camera
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
          hasFrame: Number.isFinite(st.staleMs),
        }),
    });
    stream.start();
    return () => stream.stop();
  }, [streamId, useWorker, wsFactory, setVideoStats, absent]);

  const state = streamState(stats, absent);
  const displayTitle = title ?? label ?? streamLabel(streamId);

  return (
    <div
      className={`tile${highlight === "blocked" ? " tile-blocked" : ""}`}
      data-testid={`stream-${streamId}`}
      data-state={state}
      data-stream-id={streamId}
    >
      {!absent && <canvas ref={canvasRef} />}
      <span className="tile-pill tile-label" data-testid="stream-title">
        {displayTitle}
      </span>
      {state !== "absent" && (
        <span className="tile-pill tile-status" data-testid="stream-status">
          {state === "connecting" ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <span className="status-dot" aria-hidden="true" />
          )}
          {STATUS_TEXT[state]}
        </span>
      )}
      {state === "absent" && (
        <div className="tile-center" data-testid="stream-absent">
          <Icon name="camera-off" size={28} />
          <span>{displayTitle} · no signal</span>
        </div>
      )}
      {state === "closed" && (
        <div className="tile-center" data-testid="stream-closed">
          Stream unavailable — retrying…
        </div>
      )}
      {state === "stale" && <div className="tile-stale-overlay" data-testid="stream-stale" />}
      {showLatencyBadge && stats && state !== "closed" && state !== "absent" && (
        <span className="tile-badge">
          {Math.round(stats.fps)} fps
          {stats.latencyMs != null ? ` · ${Math.round(stats.latencyMs)} ms` : ""}
        </span>
      )}
      {note && (
        <span className="tile-badge tile-note" data-testid="stream-note" title={note}>
          {note}
        </span>
      )}
    </div>
  );
}
