/** ControlClient — hybrid key protocol sender (05-ui §5.2).
 *
 * Immediate KeysMsg on every transition + 25 Hz (40 ms) full-state heartbeat.
 * `seq` is one monotonic counter across transitions and heartbeats (never
 * reset within a page lifetime). After every reconnect the client waits for
 * HelloMsg, then sends an empty held set — the pre-disconnect held set is
 * never replayed.
 *
 * THE HEARTBEAT IS TIED TO THE SOCKET, NOT TO CAPTURE ARMING (2026-09-07).
 * The server's `InputWatchdog` reads this stream as the browser's liveness
 * deadman and scales EVERY WS-sourced motion by it — including
 * `joint_target mode:"jog"`, which is not a held key at all. While the
 * heartbeat only ran "while capture is armed", clicking off the capture
 * surface (e.g. onto the Joint-control panel) disarmed it, sent one last empty
 * set and went silent, so 0.3 s later the watchdog latched AWAIT_EMPTY and the
 * jog scale sat at 0.0: the panel silently stopped moving the arm the moment
 * you used it, and only a fresh EMPTY KeysMsg could clear the latch. Measured
 * live at 04:40:41 on 2026-09-07 mid hardware session. Keeping the heartbeat
 * for the socket's whole life also closes the opposite hole — a client that
 * never armed capture used to leave the watchdog at scale 1.0 forever, i.e. a
 * running jog had no deadman if the tab died.
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
        if (s !== "open") {
          this.helloSeen = false; // gate sends until next hello
          this.stopHeartbeat(); // no socket, no deadman heartbeat
        }
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

  /** Records which sources are armed. The heartbeat runs for the socket's whole
   * life (see the module docstring), so disarming only sends one final empty
   * set — it must never stop the heartbeat. */
  setArmed(armed: boolean): void {
    if (armed === this.armed) return;
    this.armed = armed;
    if (!armed) this.sendKeys([]);
  }

  close(): void {
    this.setArmed(false);
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }

  private startHeartbeat(): void {
    if (this.heartbeat !== null) return;
    this.heartbeat = setInterval(() => this.sendKeys([...this.opts.getHeld()]), HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
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
      // Always resume from an all-keys-up state after (re)connect, then keep the
      // watchdog fed for as long as the socket lives.
      this.sendKeys([]);
      this.startHeartbeat();
    } else if (msg.t === "ack") {
      this.opts.onAck(msg as AckMsg);
    }
  }
}
