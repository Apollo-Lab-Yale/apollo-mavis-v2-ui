/** First-mount reveal gate (phase-11 §4/§6): the Welcome hero fades in over
 * `--dur-slow` and the cards stagger by `--stagger` exactly once per browser
 * session. A `sessionStorage` flag remembers that the reveal ran, so returning
 * from a mode page (or a hash change) never re-plays it.
 *
 * Returns `true` while the reveal classes should be applied; flips to `false`
 * after `settleMs` so the elements drop their `transition-delay` and later
 * hover/press transitions are not delayed. */
import { useEffect, useState } from "react";

export const REVEAL_FLAG = "mavis.welcome.revealed";
/** 320 ms hero + 5 × 40 ms stagger + 240 ms card enter, rounded up. */
export const REVEAL_SETTLE_MS = 800;

const readFlag = (key: string): boolean => {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(key) !== null;
  } catch {
    return true; // storage blocked → never animate rather than animate every visit
  }
};

export function useRevealOnce(key = REVEAL_FLAG, settleMs = REVEAL_SETTLE_MS): boolean {
  const [reveal, setReveal] = useState(() => !readFlag(key));

  // Mark in an effect (not the state initialiser) so StrictMode's double
  // initialiser call cannot flip the answer between the two invocations.
  useEffect(() => {
    try {
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      /* storage blocked */
    }
  }, [key]);

  useEffect(() => {
    if (!reveal) return;
    const id = window.setTimeout(() => setReveal(false), settleMs);
    return () => window.clearTimeout(id);
  }, [reveal, settleMs]);

  return reveal;
}
