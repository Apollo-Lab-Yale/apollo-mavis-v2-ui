/** MicTile (phase-11 §4): the Perception Arm (`view`) microphone as an
 * observation tile.
 *
 * Data: `telemetry.microphone` (MicrophoneTelemetry, one frame per telemetry
 * tick, de-duplicated on `seq`). Drawing happens on `requestAnimationFrame`
 * only when a new frame arrived (and once after a resize) — a 3 s scrolling
 * min/max envelope oscillogram on a dB scale (the wire envelope is int8
 * relative to the frame peak; `peak_dbfs` restores the absolute level and
 * `dbNorm` maps it with the −60 dBFS floor, so a −58 dBFS room shows a thin
 * live band while speech fills the tile), a level bar (RMS fill), a peak-hold tick
 * (1.5 s hold, then 20 dB/s decay computed per draw), a clip indicator that
 * latches 2 s at ≥ −1 dBFS, and a tabular dBFS readout. The meter is telemetry,
 * not feedback: no CSS transitions on any value, nothing pulses. Drawing pauses
 * while `document.hidden`. `role="meter"` exposes the RMS level. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MicrophoneInfo, MicrophoneTelemetry } from "../gen";
import { MIC_ID, MIC_LABEL } from "../lib/streams";
import { useStore } from "../store";
import { Icon } from "./icons";

export type MicStatus = NonNullable<MicrophoneTelemetry["status"]>;

export interface MicTileProps {
  /** Title pill (default "Perception · microphone"). */
  title?: string;
  /** Caption bottom-left, e.g. "RØDE NT-USB Mini · 48 kHz mono". */
  subtitle?: string;
  /** `GET /api/microphones` row — drives the state before telemetry arrives. */
  info?: MicrophoneInfo | null;
  /** Only telemetry blocks for this mic are drawn (default `mic_view`). */
  micId?: string;
  /** Oscillogram window in seconds (default 3). */
  windowS?: number;
  className?: string;
}

export const DB_FLOOR = -60;
export const PEAK_HOLD_MS = 1500;
export const PEAK_DECAY_DB_PER_S = 20;
export const CLIP_LATCH_MS = 2000;
const DEFAULT_RATE_HZ = 25;

/** 0..1 position of a dBFS value on the meter (−60 dBFS → 0, 0 dBFS → 1). */
export const dbNorm = (db: number | null | undefined): number =>
  db == null || !Number.isFinite(db) ? 0 : Math.min(1, Math.max(0, (db - DB_FLOOR) / -DB_FLOOR));

/** "-18.3" / "-inf" / "—". */
export const fmtDbfs = (db: number | null | undefined): string => {
  if (db == null || Number.isNaN(db)) return "—";
  if (db <= -99) return "-inf";
  return db.toFixed(1);
};

/** Signed dB-scale scope value (−1..1) of one wire envelope sample: `v` is int8
 * relative to the frame peak (±127 = the frame's loudest sample), `peakDbfs`
 * restores the absolute level, and the magnitude goes through `dbNorm` (−60 dBFS
 * floor) so quiet frames stay visible instead of collapsing onto the centerline. */
export const envToScope = (v: number, peakDbfs: number | null | undefined): number => {
  if (!v || peakDbfs == null || !Number.isFinite(peakDbfs)) return 0;
  const db = peakDbfs + 20 * Math.log10(Math.min(127, Math.abs(v)) / 127);
  return Math.sign(v) * dbNorm(db);
};

/** Ring buffer of per-bin min/max scope values (−1..1), oldest → newest. */
export class EnvelopeBuffer {
  readonly min: Float32Array;
  readonly max: Float32Array;
  private head = 0;
  filled = 0;
  constructor(readonly capacity: number) {
    this.min = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
  }
  push(
    mins: readonly number[],
    maxs: readonly number[],
    peakDbfs: number | null | undefined,
  ): void {
    const n = Math.min(mins.length, maxs.length);
    for (let i = 0; i < n; i += 1) {
      this.min[this.head] = envToScope(mins[i] ?? 0, peakDbfs);
      this.max[this.head] = envToScope(maxs[i] ?? 0, peakDbfs);
      this.head = (this.head + 1) % this.capacity;
      this.filled = Math.min(this.filled + 1, this.capacity);
    }
  }
  /** Buffer index of the i-th oldest filled sample. */
  index(i: number): number {
    return (this.head - this.filled + i + this.capacity) % this.capacity;
  }
}

interface Level {
  rms: number | null;
  peak: number | null;
  peakHold: number | null;
  peakAt: number;
  lastDecay: number;
  clipUntil: number;
}

interface Colors {
  accent: string;
  accentSoft: string;
  fg: string;
  danger: string;
  grid: string;
}

const readColors = (el: HTMLElement | null): Colors => {
  const cs = el && typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
  const v = (name: string, fallback: string) => cs?.getPropertyValue(name).trim() || fallback;
  const accent = v("--accent", "#5ac8fa");
  return {
    accent,
    accentSoft: "rgba(90, 200, 250, 0.32)",
    fg: v("--fg", "#eef1f5"),
    danger: v("--danger", "#e74c3c"),
    grid: "rgba(255, 255, 255, 0.08)",
  };
};

function drawScope(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  buf: EnvelopeBuffer | null,
  lv: Level,
  colors: Colors,
  dpr: number,
): void {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const pad = 8 * dpr;
  const barW = 10 * dpr;
  const gap = 8 * dpr;
  const scopeX = pad;
  const scopeW = Math.max(1, w - pad * 2 - barW - gap);
  const midY = h / 2;
  const amp = Math.max(1, h / 2 - pad);

  // faint centerline
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1 * dpr;
  ctx.beginPath();
  ctx.moveTo(scopeX, midY);
  ctx.lineTo(scopeX + scopeW, midY);
  ctx.stroke();

  // min/max envelope band, newest at the right edge
  if (buf && buf.filled > 0) {
    const px = scopeW / buf.capacity;
    const x0 = scopeX + scopeW - buf.filled * px;
    ctx.beginPath();
    for (let i = 0; i < buf.filled; i += 1) {
      const k = buf.index(i);
      const y = midY - (buf.max[k] ?? 0) * amp;
      const x = x0 + i * px;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = buf.filled - 1; i >= 0; i -= 1) {
      const k = buf.index(i);
      ctx.lineTo(x0 + i * px, midY - (buf.min[k] ?? 0) * amp);
    }
    ctx.closePath();
    ctx.fillStyle = colors.accentSoft;
    ctx.fill();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
  }

  // level bar: RMS fill, peak-hold tick, clip cap
  const barX = w - pad - barW;
  const barTop = pad;
  const barH = Math.max(1, h - pad * 2);
  ctx.fillStyle = colors.grid;
  ctx.fillRect(barX, barTop, barW, barH);
  const rmsH = dbNorm(lv.rms) * barH;
  if (rmsH > 0) {
    ctx.fillStyle = colors.accent;
    ctx.fillRect(barX, barTop + barH - rmsH, barW, rmsH);
  }
  const clip = performance.now() < lv.clipUntil;
  if (lv.peakHold != null) {
    const y = barTop + barH - dbNorm(lv.peakHold) * barH;
    ctx.fillStyle = clip ? colors.danger : colors.fg;
    ctx.fillRect(barX, Math.max(barTop, y - 1 * dpr), barW, 2 * dpr);
  }
  if (clip) {
    ctx.fillStyle = colors.danger;
    ctx.fillRect(barX, barTop, barW, 3 * dpr);
  }
}

const STATE_TEXT: Record<MicStatus, string> = {
  live: "LIVE",
  stalled: "STALLED",
  starting: "Starting…",
  absent: "NO SIGNAL",
  error: "ERROR",
  no_backend: "OFF",
};

export function MicTile({
  title = MIC_LABEL,
  subtitle,
  info = null,
  micId = MIC_ID,
  windowS = 3,
  className,
}: MicTileProps) {
  const mic = useStore((s) => s.telemetry?.microphone ?? null);
  const telemetryStale = useStore((s) => s.telemetryStale);
  const block = mic && (mic.mic_id == null || mic.mic_id === micId) ? mic : null;

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufRef = useRef<EnvelopeBuffer | null>(null);
  const levelRef = useRef<Level>({
    rms: null,
    peak: null,
    peakHold: null,
    peakAt: 0,
    lastDecay: 0,
    clipUntil: 0,
  });
  const rafRef = useRef<number | null>(null);
  const lastSeqRef = useRef<number | null>(null);
  const colorsRef = useRef<Colors | null>(null);
  const dprRef = useRef(1);
  const [readout, setReadout] = useState<{
    rms: number | null;
    peak: number | null;
    clip: boolean;
  }>({ rms: null, peak: null, clip: false });

  const drawNow = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (!colorsRef.current) colorsRef.current = readColors(hostRef.current);
    drawScope(canvas, ctx, bufRef.current, levelRef.current, colorsRef.current, dprRef.current);
  }, []);

  const schedule = useCallback(() => {
    if (rafRef.current != null) return;
    if (typeof document !== "undefined" && document.hidden) return; // resume on visibilitychange
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawNow();
    });
  }, [drawNow]);

  // Canvas backing store follows the tile size (device pixels).
  useLayoutEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const fit = () => {
      const dpr =
        typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
      dprRef.current = dpr;
      const w = host.clientWidth || 640;
      const h = host.clientHeight || Math.round((w * 9) / 16);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      schedule();
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, [schedule]);

  // Redraw once when the tab becomes visible again.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [schedule]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    [],
  );

  // New frame (by seq) → append envelope, update levels, draw.
  useEffect(() => {
    if (!block || block.status !== "live") return;
    const seq = block.seq ?? 0;
    if (lastSeqRef.current === seq) return;
    lastSeqRef.current = seq;
    const rate = block.rate_hz != null && block.rate_hz > 0 ? block.rate_hz : DEFAULT_RATE_HZ;
    const cap = Math.max(1, Math.round(windowS * rate));
    const bins = Math.max(1, Math.min(block.env_min?.length ?? 0, block.env_max?.length ?? 0));
    const capBins = cap * bins;
    if (!bufRef.current || bufRef.current.capacity !== capBins) {
      bufRef.current = new EnvelopeBuffer(capBins);
    }
    bufRef.current.push(block.env_min ?? [], block.env_max ?? [], block.peak_dbfs ?? null);

    const now = performance.now();
    const lv = levelRef.current;
    const peak = block.peak_dbfs ?? null;
    if (lv.peakHold != null && now - lv.peakAt > PEAK_HOLD_MS) {
      const from = Math.max(lv.peakAt + PEAK_HOLD_MS, lv.lastDecay);
      lv.peakHold -= (PEAK_DECAY_DB_PER_S * Math.max(0, now - from)) / 1000;
      lv.lastDecay = now;
      if (lv.peakHold < DB_FLOOR) lv.peakHold = null;
    }
    if (peak != null && (lv.peakHold == null || peak >= lv.peakHold)) {
      lv.peakHold = peak;
      lv.peakAt = now;
      lv.lastDecay = now;
    }
    if (block.clipping || (peak != null && peak >= -1)) lv.clipUntil = now + CLIP_LATCH_MS;
    lv.rms = block.rms_dbfs ?? null;
    lv.peak = peak;
    setReadout({ rms: lv.rms, peak, clip: now < lv.clipUntil });
    schedule();
  }, [block, windowS, schedule]);

  const status: MicStatus = block?.status ?? info?.status ?? "absent";
  const state: MicStatus = block
    ? status === "live" && telemetryStale
      ? "stalled"
      : status
    : status === "live"
      ? "starting"
      : status;
  const detail = block?.detail || info?.detail || "";
  const showScope = state === "live" || state === "stalled";
  const rmsNow = readout.rms == null ? DB_FLOOR : Math.max(DB_FLOOR, Math.min(0, readout.rms));

  return (
    <div
      ref={hostRef}
      className={`tile mic-tile${className ? ` ${className}` : ""}`}
      data-testid="mic-tile"
      data-state={state}
      data-clipping={readout.clip ? "true" : undefined}
      role="meter"
      aria-label={`${title} level`}
      aria-valuemin={DB_FLOOR}
      aria-valuemax={0}
      aria-valuenow={Math.round(rmsNow)}
      aria-valuetext={readout.rms == null ? "no signal" : `${fmtDbfs(readout.rms)} dBFS`}
    >
      <canvas ref={canvasRef} hidden={!showScope} />
      <span className="tile-pill tile-label" data-testid="mic-title">
        <Icon name="mic" size={14} />
        {title}
      </span>
      <span className="tile-pill tile-status" data-testid="mic-status">
        {state === "starting" ? (
          <span className="spinner" aria-hidden="true" />
        ) : (
          <span className="status-dot" aria-hidden="true" />
        )}
        {STATE_TEXT[state]}
      </span>
      {state === "stalled" && <div className="tile-stale-overlay" data-testid="mic-stalled" />}
      {!showScope && (
        <div className="tile-center" data-testid="mic-message">
          {state === "starting" ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <Icon name={state === "error" ? "warning" : "mic-off"} size={28} />
          )}
          <span>
            {state === "absent" && "Microphone · not detected"}
            {state === "starting" && "Waiting for audio…"}
            {state === "error" && "Microphone error"}
            {state === "no_backend" && "No audio backend"}
          </span>
          {detail && <span className="text-caption fg-3">{detail}</span>}
        </div>
      )}
      {showScope && (
        <span className="tile-badge mic-readout" data-testid="mic-readout">
          {fmtDbfs(readout.rms)} dBFS
        </span>
      )}
      {subtitle && <span className="mic-subtitle">{subtitle}</span>}
    </div>
  );
}
