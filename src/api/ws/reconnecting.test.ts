import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFactory } from "../../../tests/mocks/fakeSocket";
import { ReconnectingWS, type ReconnectingWsOpts } from "./reconnecting";

const statuses: string[] = [];
const make = (factory: ReconnectingWsOpts["wsFactory"]) =>
  new ReconnectingWS({
    url: "ws://test/ws",
    onMessage: () => undefined,
    onStatus: (s) => statuses.push(s),
    wsFactory: factory,
  });

describe("ReconnectingWS", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    statuses.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("backs off 250→500→…→5000 with full jitter, doubling to the cap", () => {
    const { factory, sockets } = fakeFactory();
    const ws = make(factory);
    expect(sockets.length).toBe(1);

    // Failure schedule: expected delay in [backoff, 2*backoff].
    let backoff = 250;
    for (let i = 0; i < 7; i++) {
      sockets[sockets.length - 1]!.fail(); // onerror → close → schedule
      const before = sockets.length;
      // Lower bound: strictly less than `backoff` must NOT reconnect.
      vi.advanceTimersByTime(backoff - 1);
      expect(sockets.length).toBe(before);
      // Upper bound: by 2*backoff (full jitter max) it must have reconnected.
      vi.advanceTimersByTime(backoff + 1);
      expect(sockets.length).toBe(before + 1);
      backoff = Math.min(backoff * 2, 5000);
    }
    expect(backoff).toBe(5000); // reached the cap
    ws.close();
  });

  it("resets backoff to 250 after a successful open", () => {
    const { factory, sockets } = fakeFactory();
    const ws = make(factory);
    // Escalate a few times.
    for (let i = 0; i < 4; i++) {
      sockets[sockets.length - 1]!.fail();
      vi.advanceTimersByTime(5000 * 2);
    }
    sockets[sockets.length - 1]!.open(); // success resets
    sockets[sockets.length - 1]!.serverClose();
    const before = sockets.length;
    vi.advanceTimersByTime(249);
    expect(sockets.length).toBe(before);
    vi.advanceTimersByTime(252); // ≤ 2×250 jitter max
    expect(sockets.length).toBe(before + 1);
    ws.close();
  });

  it("close() is permanent — cancels pending reconnects", () => {
    const { factory, sockets } = fakeFactory();
    const ws = make(factory);
    sockets[0]!.fail();
    ws.close();
    vi.advanceTimersByTime(60_000);
    expect(sockets.length).toBe(1);
    expect(statuses[statuses.length - 1]).toBe("closed");
  });

  it("send() drops (returns false) unless OPEN", () => {
    const { factory, sockets } = fakeFactory();
    const ws = make(factory);
    expect(ws.send("x")).toBe(false);
    sockets[0]!.open();
    expect(ws.send("x")).toBe(true);
    expect(sockets[0]!.sent).toEqual(["x"]);
    ws.close();
  });
});
