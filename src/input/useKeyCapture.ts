/** Click-to-arm keyboard capture hook (05-ui §6.2).
 *
 * Held state lives in a ref — never React state. KeyboardEvent.code is used
 * throughout (layout-independent). Bound codes always get preventDefault;
 * e.repeat is ignored; discrete codes fire onAction exactly once per physical
 * press and never enter the held set. Release-all (clear held + empty-set
 * send + disarm) on blur, hidden visibilitychange, Escape, and unmount.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionName } from "../lib/types";
import { actionFor, type Bindings } from "./bindings";

export interface KeyCaptureApi {
  armed: boolean;
  arm(): void;
  disarm(): void;
  heldRef: React.RefObject<ReadonlySet<string>>;
}

export function useKeyCapture(opts: {
  bindings: Bindings | null; // null → hook inert
  onHeldChange: () => void; // → control.notifyTransition()
  onAction: (name: ActionName) => void; // → control.sendAction(name)
  onArmedChange: (armed: boolean) => void; // → control.setArmed(armed)
}): KeyCaptureApi {
  const [armed, setArmed] = useState(false);
  const heldRef = useRef<Set<string>>(new Set());
  const armedRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const disarm = useCallback(() => {
    if (!armedRef.current) return;
    armedRef.current = false;
    if (heldRef.current.size > 0) heldRef.current.clear();
    optsRef.current.onHeldChange(); // immediate empty KeysMsg
    setArmed(false);
    optsRef.current.onArmedChange(false);
  }, []);

  const arm = useCallback(() => {
    if (armedRef.current || !optsRef.current.bindings) return;
    armedRef.current = true;
    setArmed(true);
    optsRef.current.onArmedChange(true);
  }, []);

  const bindings = opts.bindings;

  useEffect(() => {
    if (!armed || !bindings) return;

    const keydown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        disarm();
        return;
      }
      if (!bindings.bound.has(e.code)) return; // browser default runs
      e.preventDefault(); // always — stops Tab focus, Space scroll, arrows
      if (e.repeat) return; // motion derives from held state, never auto-repeat
      const action = actionFor(bindings, e.code);
      if (action) {
        optsRef.current.onAction(action); // discrete: once per physical press
        return;
      }
      if (bindings.held.has(e.code) && !heldRef.current.has(e.code)) {
        heldRef.current.add(e.code);
        optsRef.current.onHeldChange();
      }
    };

    const keyup = (e: KeyboardEvent) => {
      if (!bindings.bound.has(e.code)) return;
      e.preventDefault();
      if (heldRef.current.delete(e.code)) optsRef.current.onHeldChange();
      // discrete codes are no-ops on keyup
    };

    const onBlur = () => disarm();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") disarm();
    };

    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [armed, bindings, disarm]);

  // Unmount: release-all.
  useEffect(() => () => disarm(), [disarm]);

  return useMemo(
    () => ({ armed, arm, disarm, heldRef: heldRef as React.RefObject<ReadonlySet<string>> }),
    [armed, arm, disarm],
  );
}
