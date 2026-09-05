/** Protocol-speaking mock runtime WS servers (mock-socket) — 05-ui §11.
 *
 * Control: sends HelloMsg on connect (configurable epoch/role), records
 * KeysMsg/ActionMsg, acks actions. Telemetry: pushes TelemetryMsg fixtures.
 * Video: pushes binary frames built with buildFrame (mirrors parseFrameHeader).
 */
import { Server, WebSocket as MockWebSocket } from "mock-socket";
import { buildFrame } from "../../src/lib/binary";
import type { TelemetryMsg } from "../../src/gen";

export const mockWsFactory = (url: string): WebSocket =>
  new MockWebSocket(url) as unknown as WebSocket;

type Client = { send(data: string | ArrayBuffer | ArrayBufferView): void };

export class MockControlServer {
  server: Server;
  clients: Client[] = [];
  keys: { t: string; seq: number; ts: number; held: string[] }[] = [];
  actions: { t: string; name: string; args?: Record<string, unknown> }[] = [];
  epoch = "epoch-1";
  role: "controller" | "observer" = "controller";
  sessionId: string | null = "sess-1";
  ackOk = true;
  ackDetail = "";

  constructor(public url: string) {
    this.server = new Server(url);
    this.server.on("connection", (socket) => {
      this.clients.push(socket);
      socket.send(
        JSON.stringify({
          t: "hello",
          epoch: this.epoch,
          session_id: this.sessionId,
          role: this.role,
        }),
      );
      socket.on("message", (data) => {
        if (typeof data !== "string") return;
        const msg = JSON.parse(data) as Record<string, unknown>;
        if (msg["t"] === "keys") {
          this.keys.push(msg as never);
        } else if (msg["t"] === "action") {
          this.actions.push(msg as never);
          socket.send(
            JSON.stringify({ t: "ack", name: msg["name"], ok: this.ackOk, detail: this.ackDetail }),
          );
        }
      });
    });
  }

  get lastHeld(): string[] | null {
    const last = this.keys[this.keys.length - 1];
    return last ? last.held : null;
  }

  stop(): void {
    try {
      this.server.close({ code: 1001, reason: "server stopped", wasClean: true });
    } catch {
      /* already stopped */
    }
    this.server.stop();
  }
}

export class MockTelemetryServer {
  server: Server;
  private sockets: Client[] = [];

  constructor(public url: string) {
    this.server = new Server(url);
    this.server.on("connection", (socket) => this.sockets.push(socket));
  }

  push(msg: TelemetryMsg): void {
    const data = JSON.stringify(msg);
    for (const s of this.sockets) s.send(data);
  }

  stop(): void {
    this.server.stop();
  }
}

export class MockVideoServer {
  server: Server;
  private sockets: Client[] = [];

  constructor(public url: string) {
    this.server = new Server(url);
    this.server.on("connection", (socket) => this.sockets.push(socket));
  }

  /** WebSocket connections accepted so far (an `absent` tile must never dial). */
  get connections(): number {
    return this.sockets.length;
  }

  pushFrame(ts: number, jpeg: Uint8Array = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])): void {
    const buf = buildFrame(ts, jpeg);
    for (const s of this.sockets) s.send(buf);
  }

  stop(): void {
    this.server.stop();
  }
}
