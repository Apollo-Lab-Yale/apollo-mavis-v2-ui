/** 2-D top-down tracker trail (13-tracker §5): x right, y up, autoscaled.
 *
 * Telemetry arrives at 25 Hz and replaces the whole object, so this component
 * never puts per-frame data in React state: it subscribes to the store,
 * appends `pose_world` into a ring buffer (~5 s) and repaints a canvas ref.
 * Anchor (amber ring) and target (green cross) are drawn while engaged.
 */
import { useEffect, useRef } from "react";
import type { TrackerTelemetry } from "../gen";
import { useStore } from "../store";

export interface TrackerTrailProps {
  seconds?: number; // trail length, default 5 s
  hz?: number; // telemetry rate, default 25
  size?: number; // canvas pixels (square), default 360
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function extend(b: Bounds, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (x > b.maxX) b.maxX = x;
  if (y < b.minY) b.minY = y;
  if (y > b.maxY) b.maxY = y;
}

export function TrackerTrail({ seconds = 5, hz = 25, size = 360 }: TrackerTrailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cap = Math.max(2, Math.round(seconds * hz));
    const ring = new Float64Array(cap * 2);
    let head = 0; // next write slot
    let count = 0;
    let lastSeq: number | null = null;

    const push = (x: number, y: number) => {
      ring[head * 2] = x;
      ring[head * 2 + 1] = y;
      head = (head + 1) % cap;
      if (count < cap) count += 1;
    };
    const at = (i: number): [number, number] => {
      // i = 0 oldest … count-1 newest
      const idx = (head - count + i + cap) % cap;
      return [ring[idx * 2] ?? 0, ring[idx * 2 + 1] ?? 0];
    };

    const draw = (tr: TrackerTelemetry | null) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      const anchor = tr?.anchor_tcp?.position ?? null;
      const target = tr?.target_tcp?.position ?? null;
      const engaged = !!tr?.clutch && (anchor !== null || target !== null);

      if (count === 0 && !anchor && !target) {
        ctx.fillStyle = "#8b98a9";
        ctx.font = "12px ui-monospace, monospace";
        ctx.fillText("no tracker pose yet", 12, h / 2);
        return;
      }

      const b: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      for (let i = 0; i < count; i++) {
        const [x, y] = at(i);
        extend(b, x, y);
      }
      if (engaged && anchor) extend(b, anchor[0], anchor[1]);
      if (engaged && target) extend(b, target[0], target[1]);
      const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 0.1) * 1.2; // ≥ 10 cm, 10 % pad
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const scale = Math.min(w, h) / span; // px per metre, equal aspect
      const px = (x: number) => w / 2 + (x - cx) * scale;
      const py = (y: number) => h / 2 - (y - cy) * scale; // y up

      // Axes through the centre + scale label.
      ctx.strokeStyle = "#2b3442";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      ctx.fillStyle = "#8b98a9";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(`x → · y ↑ · span ${span.toFixed(2)} m`, 8, h - 8);

      // Trail: older → dimmer, drawn as short segments.
      for (let i = 1; i < count; i++) {
        const [x0, y0] = at(i - 1);
        const [x1, y1] = at(i);
        const a = 0.25 + (0.75 * i) / count;
        ctx.strokeStyle = `rgba(59, 130, 246, ${a.toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px(x0), py(y0));
        ctx.lineTo(px(x1), py(y1));
        ctx.stroke();
      }
      if (count > 0) {
        const [x, y] = at(count - 1);
        ctx.fillStyle = "#3b82f6";
        ctx.beginPath();
        ctx.arc(px(x), py(y), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (engaged && anchor) {
        ctx.strokeStyle = "#f5a623";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px(anchor[0]), py(anchor[1]), 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (engaged && target) {
        const tx = px(target[0]);
        const ty = py(target[1]);
        ctx.strokeStyle = "#2ecc71";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx - 6, ty);
        ctx.lineTo(tx + 6, ty);
        ctx.moveTo(tx, ty - 6);
        ctx.lineTo(tx, ty + 6);
        ctx.stroke();
      }
    };

    const ingest = (tr: TrackerTelemetry | null, telemetrySeq: number | null) => {
      if (!tr) {
        count = 0;
        head = 0;
        lastSeq = null;
      } else if (tr.pose_world) {
        const seq = tr.seq ?? telemetrySeq;
        if (seq !== lastSeq) {
          lastSeq = seq;
          push(tr.pose_world.position[0], tr.pose_world.position[1]);
        }
      }
      draw(tr);
    };

    const st = useStore.getState();
    ingest(st.telemetry?.tracker ?? null, st.telemetry?.seq ?? null);
    const unsub = useStore.subscribe((s, prev) => {
      if (s.telemetry === prev.telemetry) return;
      ingest(s.telemetry?.tracker ?? null, s.telemetry?.seq ?? null);
    });
    return unsub;
  }, [seconds, hz]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="trail-canvas"
      data-testid="tracker-trail"
      aria-label="tracker top-down trail"
    />
  );
}
