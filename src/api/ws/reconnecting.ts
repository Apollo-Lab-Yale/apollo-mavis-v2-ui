/** Bespoke reconnecting WebSocket wrapper (05-ui §5.1). DOM-free.
 *
 * Backoff: 250 ms base, full jitter (delay = backoff + random()*backoff),
 * doubling to a 5 s cap; reset to base on successful open. onerror funnels
 * through close(). The WebSocket constructor is injected for tests.
 */
import type { WsStatus } from "../../lib/types";

export type WsFactory = (url: string) => WebSocket;

export interface ReconnectingWsOpts {
  url: string;
  onMessage: (data: string | ArrayBuffer) => void;
  onStatus: (s: WsStatus) => void;
  binaryType?: "arraybuffer";
  wsFactory?: WsFactory;
  baseBackoffMs?: number; // 250
  maxBackoffMs?: number; // 5000
}

export class ReconnectingWS {
  private ws: WebSocket | null = null;
  private backoff: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private readonly base: number;
  private readonly max: number;
  private readonly factory: WsFactory;

  constructor(private opts: ReconnectingWsOpts) {
    this.base = opts.baseBackoffMs ?? 250;
    this.max = opts.maxBackoffMs ?? 5000;
    this.backoff = this.base;
    this.factory = opts.wsFactory ?? ((u) => new WebSocket(u));
    this.open();
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  send(data: string | ArrayBufferLike): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
      return true;
    }
    return false; // dropped
  }

  /** Drop the current socket and dial again right now (backoff reset). Used by
   * the stream / telemetry clients when a socket that claims to be OPEN has not
   * delivered anything for a long time (half-open connection after a proxy /
   * NAT / laptop-sleep drop: no close event ever arrives, so the normal
   * onclose -> backoff path never runs). No-op after close(). */
  reconnectNow(): void {
    if (this.closed) return;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
    this.backoff = this.base;
    this.open();
  }

  /** Permanent close — cancels any pending reconnect. */
  close(): void {
    this.closed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
    this.opts.onStatus("closed");
  }

  private open(): void {
    if (this.closed) return;
    this.opts.onStatus("connecting");
    let ws: WebSocket;
    try {
      ws = this.factory(this.opts.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    if (this.opts.binaryType) ws.binaryType = this.opts.binaryType;
    ws.onopen = () => {
      this.backoff = this.base; // reset on success
      this.opts.onStatus("open");
    };
    ws.onmessage = (ev: MessageEvent) => {
      this.opts.onMessage(ev.data as string | ArrayBuffer);
    };
    ws.onerror = () => {
      ws.close(); // every failure funnels through onclose
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.opts.onStatus("closed");
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closed || this.timer !== null) return;
    const delay = this.backoff + Math.random() * this.backoff; // full jitter
    this.backoff = Math.min(this.backoff * 2, this.max);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.open();
    }, delay);
  }
}
