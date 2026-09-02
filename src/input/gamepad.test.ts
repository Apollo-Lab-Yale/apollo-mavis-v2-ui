import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEYMAP } from "../../tests/mocks/fixtures";
import { buildBindings } from "./bindings";
import {
  GAMEPAD_POLL_MS,
  GamepadAdapter,
  type GamepadLike,
  type GamepadSnapshot,
  normalizeGamepad,
} from "./gamepad";

const bindings = buildBindings(KEYMAP);

/** Mutable fake pad; `mapping` "standard" or "" (raw joydev order). */
function makePad(
  mapping = "standard",
  nButtons = 17,
  nAxes = 8,
): GamepadLike & {
  press(i: number, value?: number): void;
  release(i: number): void;
  axis(i: number, v: number): void;
} {
  const buttons = Array.from({ length: nButtons }, () => ({ pressed: false, value: 0 }));
  const axes = Array.from({ length: nAxes }, () => 0);
  return {
    index: 0,
    id: "Fake Xbox (Vendor: 045e Product: 028e)",
    mapping,
    connected: true,
    buttons,
    axes,
    press(i, value = 1) {
      buttons[i] = { pressed: value >= 0.5, value };
    },
    release(i) {
      buttons[i] = { pressed: false, value: 0 };
    },
    axis(i, v) {
      axes[i] = v;
    },
  };
}

function setup(pad: GamepadLike | null, canArm = () => true) {
  const pads: (GamepadLike | null)[] = [pad];
  const onHeldChange = vi.fn();
  const onAction = vi.fn();
  const onArmedChange = vi.fn();
  const snapshots: GamepadSnapshot[] = [];
  const adapter = new GamepadAdapter({
    getGamepads: () => pads,
    getBindings: () => bindings,
    canArm,
    onHeldChange,
    onAction,
    onArmedChange,
    onSnapshot: (s) => snapshots.push(s),
  });
  adapter.start();
  return { adapter, pads, onHeldChange, onAction, onArmedChange, snapshots };
}

const tick = (n = 1) => vi.advanceTimersByTime(GAMEPAD_POLL_MS * n);

describe("normalizeGamepad", () => {
  it("standard mapping: A/B/LB/RB buttons, RT by value threshold, D-pad buttons 14/15", () => {
    const pad = makePad("standard");
    pad.press(0);
    pad.press(5);
    pad.press(14);
    pad.press(7, 0.4);
    let n = normalizeGamepad(pad);
    expect(n.pressed).toMatchObject({
      A: true,
      B: false,
      LB: false,
      RB: true,
      RT: false,
      DpadLeft: true,
      DpadRight: false,
    });
    pad.press(7, 0.5);
    n = normalizeGamepad(pad);
    expect(n.pressed.RT).toBe(true);
    expect(n.rt).toBe(0.5);
    expect(n.buttons.length).toBe(17);
    expect(n.axes.length).toBe(8);
  });

  it("raw joydev order: D-pad on axes[6], RT on axes[5] with −1..1 or 0..1 ranges", () => {
    const pad = makePad("", 11, 8);
    pad.press(1);
    pad.press(4);
    pad.axis(6, -1);
    let n = normalizeGamepad(pad, -1);
    expect(n.pressed).toMatchObject({ A: false, B: true, LB: true, RB: false });
    expect(n.pressed.DpadLeft).toBe(true);
    expect(n.pressed.DpadRight).toBe(false);
    pad.axis(6, 1);
    n = normalizeGamepad(pad, -1);
    expect(n.pressed.DpadRight).toBe(true);
    // −1..1 range (rest observed at −1): pressed once the axis goes above 0.
    pad.axis(5, -0.2);
    expect(normalizeGamepad(pad, -1).pressed.RT).toBe(false);
    pad.axis(5, 0.1);
    expect(normalizeGamepad(pad, -1).pressed.RT).toBe(true);
    // 0..1 range (rest observed at 0): threshold 0.5.
    pad.axis(5, 0.4);
    expect(normalizeGamepad(pad, 0).pressed.RT).toBe(false);
    pad.axis(5, 0.6);
    expect(normalizeGamepad(pad, 0).pressed.RT).toBe(true);
  });
});

describe("GamepadAdapter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("discrete row: one sendAction per press edge, never in the held set", () => {
    const pad = makePad();
    const { adapter, onAction, onArmedChange } = setup(pad);
    tick();
    pad.press(5); // RB → Tab → switch_arm
    tick(3); // held across several polls → still one action
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("switch_arm");
    expect(adapter.held.size).toBe(0);
    pad.release(5);
    tick();
    pad.press(4); // LB → KeyZ → switch_arm_prev
    tick();
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenLastCalledWith("switch_arm_prev");
    // First press auto-armed capture exactly once.
    expect(onArmedChange).toHaveBeenCalledTimes(1);
    expect(onArmedChange).toHaveBeenCalledWith(true);
    adapter.stop();
  });

  it("held row: code added once with one transition; release removes it", () => {
    const pad = makePad();
    const { adapter, onHeldChange } = setup(pad);
    tick();
    pad.press(0); // A → KeyH gripper_open (held)
    tick(4);
    expect([...adapter.held]).toEqual(["KeyH"]);
    expect(onHeldChange).toHaveBeenCalledTimes(1);
    pad.press(14); // DpadLeft → ArrowLeft rail_neg (held)
    tick();
    expect([...adapter.held].sort()).toEqual(["ArrowLeft", "KeyH"]);
    expect(onHeldChange).toHaveBeenCalledTimes(2);
    pad.release(0);
    tick();
    expect([...adapter.held]).toEqual(["ArrowLeft"]);
    expect(onHeldChange).toHaveBeenCalledTimes(3);
    adapter.stop();
  });

  it("RT analog threshold: 0.4 is released, 0.5 engages the clutch code KeyC", () => {
    const pad = makePad();
    const { adapter, onHeldChange } = setup(pad);
    pad.press(7, 0.4);
    tick();
    expect(adapter.held.has("KeyC")).toBe(false);
    expect(onHeldChange).not.toHaveBeenCalled();
    pad.press(7, 0.5);
    tick();
    expect(adapter.held.has("KeyC")).toBe(true);
    pad.press(7, 0.9);
    tick(3);
    expect(onHeldChange).toHaveBeenCalledTimes(1); // analog wobble above threshold → no edges
    pad.press(7, 0.2);
    tick();
    expect(adapter.held.has("KeyC")).toBe(false);
    expect(onHeldChange).toHaveBeenCalledTimes(2);
    adapter.stop();
  });

  it("raw (non-standard) mapping drives the same rows via axes 6 / 5", () => {
    const pad = makePad("", 11, 8);
    pad.axis(5, -1); // RT at rest (−1..1 range)
    const { adapter, onHeldChange, onAction } = setup(pad);
    tick(); // learns rtMin = −1
    pad.axis(6, 1); // D-pad right → ArrowRight
    tick();
    expect(adapter.held.has("ArrowRight")).toBe(true);
    pad.axis(5, 0.2); // RT past mid-travel → KeyC
    tick();
    expect(adapter.held.has("KeyC")).toBe(true);
    pad.axis(5, -1);
    pad.axis(6, 0);
    tick();
    expect(adapter.held.size).toBe(0);
    expect(onHeldChange).toHaveBeenCalledTimes(3);
    pad.press(4); // LB → switch_arm_prev
    tick();
    expect(onAction).toHaveBeenCalledWith("switch_arm_prev");
    adapter.stop();
  });

  it("disconnect → release-all: held cleared, empty transition, disarmed", () => {
    const pad = makePad();
    const { adapter, pads, onHeldChange, onArmedChange } = setup(pad);
    pad.press(1); // B → KeyF gripper_close
    tick();
    expect(adapter.held.has("KeyF")).toBe(true);
    onHeldChange.mockClear();
    pads[0] = null;
    window.dispatchEvent(new Event("gamepaddisconnected"));
    expect(adapter.held.size).toBe(0);
    expect(onHeldChange).toHaveBeenCalledTimes(1);
    expect(onArmedChange).toHaveBeenLastCalledWith(false);
    tick(3); // no pad → stays released, no further transitions
    expect(onHeldChange).toHaveBeenCalledTimes(1);
    adapter.stop();
  });

  it("blur / hidden / control-link-down all release-all", () => {
    const pad = makePad();
    let linkOpen = true;
    const { adapter, onHeldChange, onArmedChange } = setup(pad, () => linkOpen);
    pad.press(0);
    tick();
    expect(adapter.held.size).toBe(1);
    window.dispatchEvent(new Event("blur"));
    expect(adapter.held.size).toBe(0);
    expect(onArmedChange).toHaveBeenLastCalledWith(false);
    // Re-press re-arms (canArm still true).
    pad.release(0);
    tick();
    pad.press(0);
    tick();
    expect(adapter.held.size).toBe(1);
    expect(onArmedChange).toHaveBeenLastCalledWith(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(adapter.held.size).toBe(0);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    pad.release(0);
    tick();
    pad.press(0);
    tick();
    expect(adapter.held.size).toBe(1);
    linkOpen = false; // control link not open → release-all on the next poll
    onHeldChange.mockClear();
    tick();
    expect(adapter.held.size).toBe(0);
    expect(onHeldChange).toHaveBeenCalledTimes(1);
    expect(adapter.isArmed).toBe(false);
    // While the link is down nothing is injected or armed.
    pad.release(0);
    tick();
    pad.press(0);
    tick();
    expect(adapter.held.size).toBe(0);
    adapter.stop();
  });

  it("labels absent from the served keymap are never injected", () => {
    const pad = makePad();
    const noRt = buildBindings(KEYMAP.filter((e) => e.gamepad !== "RT" && e.gamepad !== "A"));
    const onHeldChange = vi.fn();
    const onAction = vi.fn();
    const adapter = new GamepadAdapter({
      getGamepads: () => [pad],
      getBindings: () => noRt,
      canArm: () => true,
      onHeldChange,
      onAction,
      onArmedChange: vi.fn(),
    });
    adapter.start();
    pad.press(7, 1); // RT
    pad.press(0); // A
    pad.press(2); // X — unmapped by design
    pad.press(9); // Start — unmapped by design
    tick(2);
    expect(adapter.held.size).toBe(0);
    expect(onHeldChange).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
    adapter.stop();
  });

  it("publishes snapshots only on change, with raw arrays and active labels", () => {
    const pad = makePad();
    const { adapter, snapshots } = setup(pad);
    tick(5);
    expect(snapshots.length).toBe(1); // idle pad → one snapshot
    expect(snapshots[0]).toMatchObject({ connected: true, mapping: "standard", active: [] });
    expect(snapshots[0]!.buttons.length).toBe(17);
    pad.press(0);
    tick();
    const last = snapshots[snapshots.length - 1]!;
    expect(last.active).toEqual(["A"]);
    expect(last.pressed[0]).toBe(true);
    expect(last.armed).toBe(true);
    adapter.stop();
    expect(snapshots[snapshots.length - 1]).toMatchObject({ connected: false, armed: false });
  });
});
