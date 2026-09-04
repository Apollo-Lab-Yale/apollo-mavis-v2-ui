/** Keep a closable component mounted for `exitMs` after `open` flips to false so
 * its CSS exit transition can run (phase-11 §4/§6: Sheet exit 160 ms). Consumers
 * render while this returns true and pass `open` through, e.g.
 *
 *   const mounted = useDelayedUnmount(confirming, SHEET_EXIT_MS);
 *   {mounted && <ConfirmDialog open={confirming} … />}
 *
 * Re-opening within the exit window cancels the pending unmount (the transition
 * retargets from wherever it is). Time-based rather than `transitionend`: the
 * host's `display` transition ends at the same duration, so the node is already
 * `display: none` when it unmounts, and reduced-motion only ever shortens it. */
import { useEffect, useState } from "react";

export function useDelayedUnmount(open: boolean, exitMs: number): boolean {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      if (!mounted) setMounted(true);
      return;
    }
    if (!mounted) return; // nothing to unmount — no timer, no state update
    const id = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(id);
  }, [open, mounted, exitMs]);

  return open || mounted;
}

/** Nullable-value form: the value while set, then the last value for `exitMs`
 * after it is cleared (a LaunchSheet keeps its mode, a wizard its kind, while
 * the exit runs). */
export function useLingeringValue<T>(value: T | null, exitMs: number): T | null {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (value !== null) {
      if (shown !== value) setShown(value);
      return;
    }
    if (shown === null) return;
    const id = window.setTimeout(() => setShown(null), exitMs);
    return () => window.clearTimeout(id);
  }, [value, shown, exitMs]);

  return value ?? shown;
}
