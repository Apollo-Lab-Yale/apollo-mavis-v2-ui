/** VideoStream — binary JPEG frames → canvas (05-ui §5.4).
 *
 * Main-thread path: parseFrameHeader → Blob → createImageBitmap → drawImage.
 * A `decoding` flag drops frames while a decode is in flight (latest-wins on
 * the client too — the server already keeps a depth-1 slot). Staleness uses
 * arrival time, threshold 500 ms. Pixels never touch React or the store;
 * onStats (≤4 Hz) carries only small numbers.
 */
import { parseFrameHeader } from "../../lib/binary";
import { SkewEstimator } from "../../lib/time";
import type { WsStatus } from "../../lib/types";
import { ReconnectingWS, type WsFactory } from "./reconnecting";
import { wsUrl } from "./url";

export const VIDEO_STALE_MS = 500;
const STATS_MS = 250; // ≤4 Hz

export interface VideoStats {
  staleMs: number;
  stale: boolean;
  fps: number;
  latencyMs: number | null;
  status: WsStatus;
}

export interface VideoStreamOpts {
  streamId: string;
  canvas: HTMLCanvasElement;
  onStats: (s: VideoStats) => void;
  useWorker?: boolean; // §5.5 worker path
  wsFactory?: WsFactory;
  url?: string;
}

export class VideoStream {
  private ws: ReconnectingWS | null = null;
  private worker: Worker | null = null;
  private decoding = false;
  private lastDrawAt = -Infinity;
  private frameCount = 0;
  private status: WsStatus = "connecting";
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private skew = new SkewEstimator();
  private latencyMs: number | null = null;
  private sized = false;

  constructor(private opts: VideoStreamOpts) {}

  start(): void {
    if (this.ws || this.worker) return;
    const url = this.opts.url ?? wsUrl(`/ws/video/${this.opts.streamId}`);
    if (this.opts.useWorker && "transferControlToOffscreen" in this.opts.canvas) {
      this.startWorker(url);
    } else {
      this.ws = new ReconnectingWS({
        url,
        binaryType: "arraybuffer",
        wsFactory: this.opts.wsFactory,
        onMessage: (data) => {
          if (typeof data !== "string") void this.onFrame(data);
        },
        onStatus: (s) => {
          this.status = s;
        },
      });
    }
    this.statsTimer = setInterval(() => this.emitStats(), STATS_MS);
  }

  stop(): void {
    if (this.statsTimer !== null) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.worker?.postMessage({ t: "stop" });
    this.worker?.terminate();
    this.worker = null;
  }

  private startWorker(url: string): void {
    const offscreen = this.opts.canvas.transferControlToOffscreen();
    this.worker = new Worker(new URL("./videoWorker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent) => {
      const m = ev.data as { t: string; drawAt?: number; latencyMs?: number; status?: WsStatus };
      if (m.t === "frame") {
        this.lastDrawAt = m.drawAt ?? performance.now();
        this.frameCount += 1;
        this.latencyMs = m.latencyMs ?? null;
      } else if (m.t === "status" && m.status) {
        this.status = m.status;
      }
    };
    this.worker.postMessage({ t: "start", url, canvas: offscreen }, [offscreen]);
  }

  private async onFrame(buf: ArrayBuffer): Promise<void> {
    if (this.decoding) return; // latest-wins: drop while a decode is in flight
    let header;
    try {
      header = parseFrameHeader(buf);
    } catch {
      return; // malformed frame — skip
    }
    this.decoding = true;
    try {
      const blob = new Blob([new Uint8Array(buf, header.payloadOffset, header.len)], {
        type: "image/jpeg",
      });
      const bmp = await createImageBitmap(blob);
      if (!this.sized) {
        this.opts.canvas.width = bmp.width;
        this.opts.canvas.height = bmp.height;
        this.sized = true;
      }
      const ctx = this.opts.canvas.getContext("2d");
      ctx?.drawImage(bmp, 0, 0);
      bmp.close();
      const now = performance.now();
      this.lastDrawAt = now;
      this.frameCount += 1;
      this.latencyMs = this.skew.observe(header.ts, now);
    } catch {
      /* decode failure — drop the frame */
    } finally {
      this.decoding = false;
    }
  }

  private emitStats(): void {
    const now = performance.now();
    const staleMs = now - this.lastDrawAt;
    this.opts.onStats({
      staleMs,
      stale: staleMs > VIDEO_STALE_MS,
      fps: this.frameCount * (1000 / STATS_MS),
      latencyMs: this.latencyMs,
      status: this.status,
    });
    this.frameCount = 0;
  }
}
