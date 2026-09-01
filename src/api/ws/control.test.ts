import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSocket, fakeFactory } from "../../../tests/mocks/fakeSocket";
import type { AckMsg, HelloMsg } from "../../gen";
import { ControlClient, HEARTBEAT_MS } from "./control";

const hello = (over: Partial<HelloMsg> = {}): string =>
  JSON.stringify({ t: "hello", epoch: "e1", session_id: "s1", role: "controller", ...over });

function setup() {
  const held = new Set<string>();
  const hellos: HelloMsg[] = [];
  const acks: AckMsg[] = [];
  const statuses: string[] = [];
  const { factory, sockets } = fakeFactory();
  const client = new ControlClient({
    getHeld: () => held,
    onHello: (h) => hellos.push(h),
    onAck: (a) => acks.push(a),
    onStatus: (s) => statuses.push(s),
    wsFactory: factory,
    url: "ws://test/ws/control",
  });
  client.connect();
  return { client, held, hellos, acks, statuses, sockets };
}

const keysOf = (s: FakeSocket) => s.sentJson.filter((m) => m["t"] === "keys");

describe("ControlClient", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends an immediate KeysMsg on every transition", () => {
    const { client, held, sockets } = setup();
    const s = sockets[0]!;
    s.open();
    s.message(hello());
    expect(keysOf(s).length).toBe(1); // post-hello empty set
    expect(keysOf(s)[0]!["held"]).toEqual([]);

    held.add("KeyW");
    client.notifyTransition();
    held.add("KeyA");
    client.notifyTransition();
    held.delete("KeyW");
    client.notifyTransition();
    const msgs = keysOf(s);
    expect(msgs.length).toBe(4);
    expect(msgs[1]!["held"]).toEqual(["KeyW"]);
    expect(msgs[2]!["held"]).toEqual(["KeyW", "KeyA"]);
    expect(msgs[3]!["held"]).toEqual(["KeyA"]);
  });

  it("heartbeats the full state at 40 ms while armed", () => {
    const { client, held, sockets } = setup();
    const s = sockets[0]!;
    s.open();
    s.message(hello());
    held.add("KeyW");
    client.setArmed(true);
    const before = keysOf(s).length;
    vi.advanceTimersByTime(HEARTBEAT_MS * 5 + 5);
    const beats = keysOf(s).slice(before);
    expect(beats.length).toBe(5);
    expect(beats.every((m) => JSON.stringify(m["held"]) === '["KeyW"]')).toBe(true);
    client.setArmed(false);
    const afterDisarm = keysOf(s).length;
    vi.advanceTimersByTime(HEARTBEAT_MS * 10);
    expect(keysOf(s).length).toBe(afterDisarm); // heartbeat stopped
  });

  it("keeps seq strictly increasing across transitions and heartbeats", () => {
    const { client, held, sockets } = setup();
    const s = sockets[0]!;
    s.open();
    s.message(hello());
    client.setArmed(true);
    held.add("KeyW");
    client.notifyTransition();
    vi.advanceTimersByTime(HEARTBEAT_MS * 3);
    held.delete("KeyW");
    client.notifyTransition();
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    const seqs = keysOf(s).map((m) => m["seq"] as number);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]!).toBeGreaterThan(seqs[i - 1]!);
  });

  it("disarm sends one final empty set", () => {
    const { client, held, sockets } = setup();
    const s = sockets[0]!;
    s.open();
    s.message(hello());
    held.add("KeyW");
    client.setArmed(true);
    vi.advanceTimersByTime(HEARTBEAT_MS);
    held.clear();
    client.setArmed(false);
    const msgs = keysOf(s);
    expect(msgs[msgs.length - 1]!["held"]).toEqual([]);
  });

  it("after reconnect waits for hello, then the first keys message is an empty set", () => {
    const { client, held, sockets } = setup();
    const s0 = sockets[0]!;
    s0.open();
    s0.message(hello());
    held.add("KeyW");
    client.notifyTransition();

    s0.serverClose(); // drop mid-hold
    vi.advanceTimersByTime(600); // ≥ max first backoff
    const s1 = sockets[1]!;
    expect(s1).toBeDefined();
    s1.open();
    // Before hello: transitions must NOT go out (held set never replayed).
    client.notifyTransition();
    expect(keysOf(s1).length).toBe(0);
    s1.message(hello());
    const msgs = keysOf(s1);
    expect(msgs.length).toBe(1);
    expect(msgs[0]!["held"]).toEqual([]); // never the pre-disconnect held set
  });

  it("surfaces hello (epoch check happens in the app handler) and acks", () => {
    const { hellos, acks, sockets } = setup();
    const s = sockets[0]!;
    s.open();
    s.message(hello({ epoch: "e2" }));
    expect(hellos[0]!.epoch).toBe("e2");
    s.message(JSON.stringify({ t: "ack", name: "switch_arm", ok: false, detail: "no session" }));
    expect(acks[0]).toMatchObject({ name: "switch_arm", ok: false });
  });

  it("a throttled heartbeat after visibilitychange-disarm only ever sends empty sets", () => {
    const { client, held, sockets } = setup();
    const s = sockets[0]!;
    s.open();
    s.message(hello());
    held.add("KeyW");
    client.setArmed(true);
    vi.advanceTimersByTime(HEARTBEAT_MS);
    // visibilitychange path: capture clears held, then disarms.
    held.clear();
    client.setArmed(false);
    vi.advanceTimersByTime(HEARTBEAT_MS * 20);
    const msgs = keysOf(s);
    const tail = msgs.slice(-1)[0]!;
    expect(tail["held"]).toEqual([]);
  });
});
