/** Mounts one GamepadAdapter wired to the app singletons (13-tracker §5).
 *
 * Held codes go into the shared held union under the "gamepad" source, press
 * edges auto-arm the control heartbeat under the "gamepad" arming source, and
 * the latest snapshot lands in `store.gamepad` (only on change).
 */
import { useEffect } from "react";
import { getControl, registerHeldSource, setArmedSource } from "../api/clients";
import { getModalHost } from "../lib/modalHost";
import { useStore } from "../store";
import { GamepadAdapter, type GamepadLike } from "./gamepad";

export interface UseGamepadOpts {
  getGamepads?: () => readonly (GamepadLike | null)[]; // tests
  pollMs?: number;
}

export function useGamepad(opts: UseGamepadOpts = {}): void {
  const { getGamepads, pollMs } = opts;
  useEffect(() => {
    const control = getControl();
    const adapter = new GamepadAdapter({
      getGamepads,
      pollMs,
      getBindings: () => useStore.getState().bindings,
      canArm: () => {
        // An open modal freezes browser-driven input (2026-09-07): keyboard
        // capture disarms itself when the dialog takes focus, and the gamepad
        // has no focus to lose, so it is gated here. `canArm() === false` makes
        // the adapter latch a release-all, so a button held across the dialog
        // opening must be physically released before it can inject again — the
        // operator cannot leave a jog running under a dialog.
        if (getModalHost() !== null) return false;
        const c = useStore.getState().conn;
        return c.control === "open" && c.role === "controller";
      },
      onHeldChange: () => control.notifyTransition(),
      onAction: (name) => control.sendAction(name),
      onArmedChange: (armed) => {
        setArmedSource("gamepad", armed);
        useStore.getState().setGamepad({ armed });
      },
      onSnapshot: (s) => useStore.getState().setGamepad(s),
    });
    const unregister = registerHeldSource("gamepad", () => adapter.held);
    adapter.start();
    return () => {
      adapter.stop(); // release-all + disarm
      unregister();
    };
  }, [getGamepads, pollMs]);
}
