/** Keymap → BOUND set, grouping, display labels (05-ui §6.1).
 *
 * The canonical keymap is fetched from GET /api/keymap — no hardcoded copy.
 * Rail keys are always in `bound` and always sent while held; the server
 * ignores them for non-rail arms (UI only hides them from the overlay).
 */
import type { KeymapEntry } from "../gen";
import type { ActionName } from "../lib/types";

export interface Bindings {
  bound: ReadonlySet<string>; // every code we preventDefault
  held: ReadonlySet<string>; // kind === "held"
  discrete: ReadonlyMap<string, ActionName>; // code → action
  byGroup: ReadonlyMap<KeymapEntry["group"], KeymapEntry[]>;
  entries: readonly KeymapEntry[];
}

export function buildBindings(entries: KeymapEntry[]): Bindings {
  const bound = new Set<string>();
  const held = new Set<string>();
  const discrete = new Map<string, ActionName>();
  const byGroup = new Map<KeymapEntry["group"], KeymapEntry[]>();
  for (const e of entries) {
    bound.add(e.code);
    if (e.kind === "held") held.add(e.code);
    else discrete.set(e.code, e.action as ActionName);
    const g = byGroup.get(e.group);
    if (g) g.push(e);
    else byGroup.set(e.group, [e]);
  }
  return { bound, held, discrete, byGroup, entries };
}

export function actionFor(bindings: Bindings, code: string): ActionName | null {
  return bindings.discrete.get(code) ?? null;
}

/** Physical keycap hint from a KeyboardEvent.code ("KeyW" → "W", "ArrowLeft" → "←"). */
export function keycapLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const special: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Space: "Space",
    Tab: "Tab",
    Enter: "Enter",
    Backspace: "Backspace",
    Escape: "Esc",
    Slash: "/",
  };
  return special[code] ?? code;
}
