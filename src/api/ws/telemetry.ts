/** TelemetryClient — read-only consumer of /ws/telemetry (05-ui §5.3).
 *
 * Drops out-of-order seq, feeds the store imperatively (outside React), and
 * flips a staleness flag when no message arrives for 1000 ms.
 */
import type { TelemetryMsg } from "../../gen";
import type { WsStatus } from "../../lib/types";
import { ReconnectingWS, type WsFactory } from "./reconnecting";
import { wsUrl } from "./url";

export const STALE_AFTER_MS = 1000;
/** OPEN socket but no telemetry for this long -> half-open connection, dial again. */
export const STALE_RECONNECT_MS = 10_000;
const TICK_MS = 500;

export interface TelemetryClientOpts {
  onTelemetry: (msg: TelemetryMsg) => void; // store.setState — outside React
  onStatus: (s: WsStatus) => void;
  onStale: (stale: boolean) => void;
  wsFactory?: WsFactory;
  url?: string;
  now?: () => number; // performance.now, injectable for tests
}

export class TelemetryClient {
  private ws: ReconnectingWS | null = null;
  private lastSeq = -Infinity;
  private lastAt = -Infinity;
  private stale = true;
  private lastHealAt = -Infinity;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;

  constructor(private opts: TelemetryClientOpts) {
    this.now = opts.now ?? (() => performance.now());
  }

  connect(): void {
    if (this.ws) return;
    this.lastHealAt = this.now(); // grace: a fresh socket gets a full window before any heal
    this.ws = new ReconnectingWS({
      url: this.opts.url ?? wsUrl("/ws/telemetry"),
      wsFactory: this.opts.wsFactory,
      onMessage: (data) => this.onMessage(data),
      onStatus: (s) => {
        if (s === "closed") this.lastSeq = -Infinity; // server restarts seq per connection
        this.opts.onStatus(s);
      },
    });
    this.ticker = setInterval(() => {
      const now = this.now();
      const stale = now - this.lastAt > STALE_AFTER_MS;
      if (stale !== this.stale) {
        this.stale = stale;
        this.opts.onStale(stale);
      }
      // Self-heal a half-open socket: OPEN for the whole silence, nothing arrived.
      if (
        this.ws &&
        this.ws.readyState === WebSocket.OPEN &&
        now - Math.max(this.lastAt, this.lastHealAt) > STALE_RECONNECT_MS &&
        !(typeof document !== "undefined" && document.hidden)
      ) {
        this.lastHealAt = now;
        this.ws.reconnectNow();
      }
    }, TICK_MS);
  }

  close(): void {
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private onMessage(data: string | ArrayBuffer): void {
    if (typeof data !== "string") return;
    let msg: TelemetryMsg;
    try {
      msg = JSON.parse(data) as TelemetryMsg;
    } catch {
      return;
    }
    if (msg.t !== "telemetry" || typeof msg.seq !== "number") return;
    if (msg.seq <= this.lastSeq) return; // stale/reordered
    this.lastSeq = msg.seq;
    this.lastAt = this.now();
    if (this.stale) {
      this.stale = false;
      this.opts.onStale(false);
    }
    this.opts.onTelemetry(msg);
  }
}
