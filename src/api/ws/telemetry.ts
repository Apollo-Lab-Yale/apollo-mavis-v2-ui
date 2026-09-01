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
  private ticker: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;

  constructor(private opts: TelemetryClientOpts) {
    this.now = opts.now ?? (() => performance.now());
  }

  connect(): void {
    if (this.ws) return;
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
      const stale = this.now() - this.lastAt > STALE_AFTER_MS;
      if (stale !== this.stale) {
        this.stale = stale;
        this.opts.onStale(stale);
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
