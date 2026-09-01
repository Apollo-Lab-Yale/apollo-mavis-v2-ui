import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFactory } from "../../../tests/mocks/fakeSocket";
import { makeTelemetry } from "../../../tests/mocks/fixtures";
import type { TelemetryMsg } from "../../gen";
import { TelemetryClient } from "./telemetry";

describe("TelemetryClient", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    let now = 0;
    const got: TelemetryMsg[] = [];
    const stales: boolean[] = [];
    const { factory, sockets } = fakeFactory();
    const client = new TelemetryClient({
      onTelemetry: (m) => got.push(m),
      onStatus: () => undefined,
      onStale: (s) => stales.push(s),
      wsFactory: factory,
      url: "ws://test/ws/telemetry",
      now: () => now,
    });
    client.connect();
    const advance = (ms: number) => {
      now += ms;
      vi.advanceTimersByTime(ms);
    };
    return { client, got, stales, sockets, advance };
  }

  it("drops messages with seq ≤ last seen", () => {
    const { got, sockets } = setup();
    const s = sockets[0]!;
    s.open();
    s.message(JSON.stringify(makeTelemetry({ seq: 5 })));
    s.message(JSON.stringify(makeTelemetry({ seq: 4 }))); // reordered — dropped
    s.message(JSON.stringify(makeTelemetry({ seq: 5 }))); // duplicate — dropped
    s.message(JSON.stringify(makeTelemetry({ seq: 6 })));
    expect(got.map((m) => m.seq)).toEqual([5, 6]);
  });

  it("flips telemetryStale after 1000 ms without a message", () => {
    const { got, stales, sockets, advance } = setup();
    const s = sockets[0]!;
    s.open();
    s.message(JSON.stringify(makeTelemetry({ seq: 1 })));
    expect(stales[stales.length - 1]).toBe(false);
    advance(900);
    expect(stales[stales.length - 1]).toBe(false);
    advance(600); // > 1000 since last message
    expect(stales[stales.length - 1]).toBe(true);
    s.message(JSON.stringify(makeTelemetry({ seq: 2 })));
    expect(stales[stales.length - 1]).toBe(false); // auto-recovers on next message
    expect(got.length).toBe(2);
  });

  it("accepts fresh seq numbering after a reconnect", () => {
    const { got, sockets, advance } = setup();
    const s0 = sockets[0]!;
    s0.open();
    s0.message(JSON.stringify(makeTelemetry({ seq: 100 })));
    s0.serverClose();
    advance(600);
    const s1 = sockets[1]!;
    s1.open();
    s1.message(JSON.stringify(makeTelemetry({ seq: 1 }))); // server restarts per-connection seq
    expect(got.map((m) => m.seq)).toEqual([100, 1]);
  });
});
