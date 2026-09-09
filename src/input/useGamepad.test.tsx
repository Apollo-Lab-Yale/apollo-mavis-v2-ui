/** useGamepad: the app-singleton wiring around GamepadAdapter — specifically the
 * `canArm` gate, which is the only policy the hook adds (13-tracker §5).
 *
 * An OPEN MODAL FREEZES THE PAD (2026-09-07): keyboard capture disarms itself
 * when a `<dialog>` takes focus, but the gamepad has no focus to lose, so the
 * hook refuses to arm while a modal host is registered. `canArm() === false`
 * makes the adapter latch a release-all, so a button held across the dialog
 * opening has to be physically released before it can inject again — the
 * operator cannot leave a jog running under a dialog. */
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEYMAP } from "../../tests/mocks/fixtures";
import { getControl, heldUnion, resetClients } from "../api/clients";
import { registerModalHost, resetModalHosts } from "../lib/modalHost";
import { useStore } from "../store";
import { buildBindings } from "./bindings";
import type { GamepadLike } from "./gamepad";
import { useGamepad } from "./useGamepad";

/** Standard-mapping pad whose button 0 (A) is bound to `tracker_clutch`. */
function makePad(): GamepadLike & { press(i: number): void; release(i: number): void } {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  return {
    id: "ESM GAME FOR WINDOWS (Vendor: 2f24 Product: 00b7)",
    index: 0,
    connected: true,
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons,
    press(i) {
      buttons[i] = { pressed: true, value: 1 };
    },
    release(i) {
      buttons[i] = { pressed: false, value: 0 };
    },
  };
}

function Harness({ pad }: { pad: GamepadLike | null }) {
  useGamepad({ getGamepads: () => [pad], pollMs: 1 });
  return null;
}

describe("useGamepad canArm gate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The control client is a singleton over a real WebSocket: construct it
    // first (that flips `conn.control` to "connecting"), stub the one call the
    // adapter makes into it, then declare the link open.
    vi.spyOn(getControl(), "notifyTransition").mockImplementation(() => undefined);
    const st = useStore.getState();
    st.setKeymap(KEYMAP, buildBindings(KEYMAP));
    st.setConn("control", "open");
    st.setRole("controller");
  });
  afterEach(() => {
    vi.useRealTimers();
    resetModalHosts();
    resetClients();
    useStore.getState().setKeymap(null, null);
    useStore.getState().setConn("control", "closed");
  });

  it("arms on a press, then an open modal latches a release-all until the button is let go", () => {
    const pad = makePad();
    render(<Harness pad={pad} />);

    pad.press(0); // A = clutch (held)
    vi.advanceTimersByTime(5);
    expect(useStore.getState().gamepad.armed).toBe(true);
    expect(heldUnion().size).toBe(1);

    // A modal opens while the button is still held → release-all + disarm.
    registerModalHost(document.createElement("dialog"));
    vi.advanceTimersByTime(5);
    expect(useStore.getState().gamepad.armed).toBe(false);
    expect(useStore.getState().gamepad.latched).toBe(true);
    expect(heldUnion().size).toBe(0);

    // Still held after the modal closes: latched, nothing injected.
    resetModalHosts();
    vi.advanceTimersByTime(5);
    expect(heldUnion().size).toBe(0);
    expect(useStore.getState().gamepad.armed).toBe(false);

    // Physically released, then pressed again → back in business.
    pad.release(0);
    vi.advanceTimersByTime(5);
    pad.press(0);
    vi.advanceTimersByTime(5);
    expect(useStore.getState().gamepad.armed).toBe(true);
    expect(heldUnion().size).toBe(1);
  });

  it("a modal open before the first press blocks arming entirely", () => {
    registerModalHost(document.createElement("dialog"));
    const pad = makePad();
    render(<Harness pad={pad} />);
    pad.press(0);
    vi.advanceTimersByTime(10);
    expect(useStore.getState().gamepad.armed).toBe(false);
    expect(heldUnion().size).toBe(0);
  });
});
