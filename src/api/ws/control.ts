/** ControlClient — hybrid key protocol sender (05-ui §5.2).
 *
 * Immediate KeysMsg on every transition + 25 Hz (40 ms) full-state heartbeat
 * while capture is armed. `seq` is one monotonic counter across transitions
 * and heartbeats (never reset within a page lifetime). After every reconnect
 * the client waits for HelloMsg, then sends an empty held set — the
 * pre-disconnect held set is never replayed.
 */
import type { AckMsg, HelloMsg } from "../../gen";
import type { ActionName, WsStatus } from "../../lib/types";
import { ReconnectingWS, type WsFactory } from "./reconnecting";
import { wsUrl } from "./url";

export const HEARTBEAT_MS = 40; // 25 Hz

export interface ControlClientOpts {
  getHeld: () => ReadonlySet<string>;
  onHello: (h: HelloMsg) => void;
  onAck: (a: AckMsg) => void;
  onStatus: (s: WsStatus) => void;
  wsFactory?: WsFactory;
  url?: string;
}

export class ControlClient {
  private ws: ReconnectingWS | null = null;
  private seq = 0;
  private armed = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private helloSeen = false;

  constructor(private opts: ControlClientOpts) {}

  connect(): void {
    if (this.ws) return;
    this.ws = new ReconnectingWS({
      url: this.opts.url ?? wsUrl("/ws/control"),
      wsFactory: this.opts.wsFactory,
      onMessage: (data) => this.onMessage(data),
      onStatus: (s) => {
        if (s !== "open") this.helloSeen = false; // gate sends until next hello
        this.opts.onStatus(s);
      },
    });
  }

  /** Capture hook calls this on every key down/up → immediate KeysMsg. */
  notifyTransition(): void {
    this.sendKeys([...this.opts.getHeld()]);
  }

  sendAction(name: ActionName, args?: Record<string, unknown>): void {
    if (!this.helloSeen) return;
    this.ws?.send(JSON.stringify({ t: "action", name, ...(args ? { args } : {}) }));
  }

  /** Starts/stops the 40 ms heartbeat; disarm sends one final empty set. */
  setArmed(armed: boolean): void {
    if (armed === this.armed) return;
    this.armed = armed;
    if (armed) {
      this.heartbeat = setInterval(() => {
        this.sendKeys([...this.opts.getHeld()]);
      }, HEARTBEAT_MS);
    } else {
      if (this.heartbeat !== null) {
        clearInterval(this.heartbeat);
        this.heartbeat = null;
      }
      this.sendKeys([]); // best-effort; server watchdog covers a dead socket
    }
  }

  close(): void {
    this.setArmed(false);
    this.ws?.close();
    this.ws = null;
  }

  private sendKeys(held: string[]): void {
    if (!this.helloSeen) return; // wait for hello after (re)connect
    this.seq += 1;
    this.ws?.send(JSON.stringify({ t: "keys", seq: this.seq, ts: Date.now() / 1000, held }));
  }

  private onMessage(data: string | ArrayBuffer): void {
    if (typeof data !== "string") return;
    let msg: { t?: string };
    try {
      msg = JSON.parse(data) as { t?: string };
    } catch {
      return;
    }
    if (msg.t === "hello") {
      this.helloSeen = true;
      this.opts.onHello(msg as HelloMsg);
      // Always resume from an all-keys-up state after (re)connect.
      this.sendKeys([]);
    } else if (msg.t === "ack") {
      this.opts.onAck(msg as AckMsg);
    }
  }
}
