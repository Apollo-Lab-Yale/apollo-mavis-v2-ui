/** Deterministic in-memory WebSocket fake for unit tests.
 *
 * Unlike mock-socket, events fire only when the test calls open()/fail()/
 * serverClose(), so fake-timer tests (backoff, heartbeat) are exact.
 */
export class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = FakeSocket.CONNECTING;
  binaryType = "blob";
  sent: (string | ArrayBufferLike)[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {}

  send(data: string | ArrayBufferLike): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }

  // -- test controls -------------------------------------------------------
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  message(data: unknown): void {
    this.onmessage?.({ data });
  }
  fail(): void {
    this.onerror?.(); // wrapper calls close() → onclose
  }
  serverClose(): void {
    this.close();
  }

  get sentJson(): Record<string, unknown>[] {
    return this.sent
      .filter((d): d is string => typeof d === "string")
      .map((d) => JSON.parse(d) as Record<string, unknown>);
  }
}

/** wsFactory capturing every socket it creates. */
export function fakeFactory(): { factory: (url: string) => WebSocket; sockets: FakeSocket[] } {
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    factory: (url: string) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s as unknown as WebSocket;
    },
  };
}
